# C5 — Settings Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development

**Goal:** Add a settings modal with retrieval, generation, system prompt, and ingestion controls. Stored in SQLite, applied at runtime.

**Architecture:** SQLite settings table (key-value), backend applies overrides at query/ingestion time, frontend modal with sliders and textarea.

**Tech Stack:** FastAPI, SQLite, React 19

---

### Task 1: Backend — settings table + CRUD

**Files:** Modify `backend/database.py`

In `init_db()`, add:
```python
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )
    """)
```

Add functions:
```python
def get_setting(key: str) -> str | None:
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT value FROM settings WHERE key = ?", (key,))
    row = cursor.fetchone()
    return row["value"] if row else None


def set_setting(key: str, value: str):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute(
        "INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?) "
        "ON CONFLICT(key) DO UPDATE SET value = ?, updated_at = ?",
        (key, value, _now(), value, _now())
    )
    conn.commit()


def get_all_settings() -> dict[str, str]:
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT key, value FROM settings")
    return {row["key"]: row["value"] for row in cursor.fetchall()}
```

Verify: `cd backend && python -c "from database import get_setting, set_setting, get_all_settings; print('OK')"`

Commit: `git add backend/database.py && git commit -m "feat: add settings table + CRUD to database.py"`

---

### Task 2: Backend — settings router

**Files:** Create `backend/routes/settings.py`

```python
import logging
from fastapi import APIRouter
from pydantic import BaseModel

from database import get_all_settings, set_setting
from llm.client import load_config

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/settings", tags=["settings")

VALID_KEYS = {
    "retrieval.top_k",
    "retrieval.similarity_threshold",
    "llm.temperature",
    "llm.max_tokens",
    "llm.system_prompt",
    "chunking.chunk_size",
    "chunking.chunk_overlap",
}


class SettingsUpdate(BaseModel):
    settings: dict[str, str]


@router.get("")
async def get_settings():
    config = load_config()
    user_settings = get_all_settings()

    defaults = {
        "retrieval.top_k": str(config["retrieval"]["top_k"]),
        "retrieval.similarity_threshold": str(config["retrieval"]["similarity_threshold"]),
        "llm.temperature": str(config["llm"]["temperature"]),
        "llm.max_tokens": str(config["llm"]["max_tokens"]),
        "llm.system_prompt": "",
        "chunking.chunk_size": str(config["chunking"]["chunk_size"]),
        "chunking.chunk_overlap": str(config["chunking"]["chunk_overlap"]),
    }

    effective = {}
    for key, default_val in defaults.items():
        user_val = user_settings.get(key, "")
        effective[key] = user_val if user_val else default_val

    return {"defaults": defaults, "overrides": user_settings, "effective": effective}


@router.put("")
async def update_settings(payload: SettingsUpdate):
    for key, value in payload.settings.items():
        if key in VALID_KEYS:
            set_setting(key, value)
    return {"status": "ok"}
```

Verify: `cd backend && python -c "from routes.settings import router; print('OK')"`

Commit: `git add backend/routes/settings.py && git commit -m "feat: add settings API router"`

---

### Task 3: Backend — wire settings into main.py

**Files:** Modify `backend/main.py`

Add import and include router:
```python
from routes.settings import router as settings_router
app.include_router(settings_router)
```

Verify: `cd backend && python -c "from main import app; print('OK')"`

Commit: `git add backend/main.py && git commit -m "feat: wire settings router into main.py"`

---

### Task 4: Backend — apply settings in generator.py

**Files:** Modify `backend/llm/generator.py`

Add import: `from database import get_setting`

Add helper functions:

```python
def _get_effective_llm_params(model: str | None = None) -> tuple[float, int, str]:
    config = load_config()
    llm_cfg = config["llm"]
    use_model = model or llm_cfg["model"]

    temp_str = get_setting("llm.temperature")
    max_tokens_str = get_setting("llm.max_tokens")

    temperature = float(temp_str) if temp_str else llm_cfg["temperature"]
    max_tokens = int(max_tokens_str) if max_tokens_str else llm_cfg["max_tokens"]

    return temperature, max_tokens, use_model


def _get_effective_system_prompt() -> str:
    override = get_setting("llm.system_prompt")
    return override.strip() if override and override.strip() else SYSTEM_PROMPT
```

In `_build_messages()`, change the system message to use `_get_effective_system_prompt()`:
```python
    messages: list[dict] = [
        {"role": "system", "content": _get_effective_system_prompt()},
    ]
```

In `generate()` and `stream()`, replace the config-based temperature/max_tokens reading with:
```python
    temperature, max_tokens, use_model = _get_effective_llm_params(model)
```

Remove the old lines that read `llm_cfg["temperature"]` and `llm_cfg["max_tokens"]` and `llm_cfg["model"]` from these functions. The `client = get_client()` and `config = load_config()` calls can remain if still needed, or be removed if unused.

Verify: `cd backend && python -c "from llm.generator import generate, stream; print('OK')"`

Commit: `git add backend/llm/generator.py && git commit -m "feat: apply user settings in generator.py"`

---

### Task 5: Backend — apply settings in retriever.py

**Files:** Modify `backend/retrieval/retriever.py`

Add import: `from database import get_setting`

In `retrieve()`, after loading config, add:

```python
    user_top_k = get_setting("retrieval.top_k")
    user_threshold = get_setting("retrieval.similarity_threshold")

    if top_k is None:
        top_k = int(user_top_k) if user_top_k else retrieval_cfg["top_k"]

    threshold = float(user_threshold) if user_threshold else retrieval_cfg["similarity_threshold"]
```

This replaces the existing lines `if top_k is None: top_k = retrieval_cfg["top_k"]` and `threshold = retrieval_cfg["similarity_threshold"]`.

Verify: `cd backend && python -c "from retrieval.retriever import retrieve; print('OK')"`

Commit: `git add backend/retrieval/retriever.py && git commit -m "feat: apply user settings in retriever.py"`

---

### Task 6: Backend — apply chunk settings + update chunker

**Files:** Modify `backend/ingest/chunker.py` and `backend/main.py`

In `chunker.py`, check if `chunk_text` accepts optional params. If not, add them:

```python
def chunk_text(text: str, chunk_size: int | None = None, chunk_overlap: int | None = None) -> list[str]:
```

Use `chunk_size` and `chunk_overlap` params if provided, falling back to config.

In `main.py`'s `ingest_files()`, before `chunk_text` call, read user settings:

```python
from database import get_setting

# Before chunk_text call:
user_chunk_size = get_setting("chunking.chunk_size")
user_chunk_overlap = get_setting("chunking.chunk_overlap")
cs = int(user_chunk_size) if user_chunk_size else None
co = int(user_chunk_overlap) if user_chunk_overlap else None
chunks = chunk_text(text, chunk_size=cs, chunk_overlap=co)
```

Also apply to the `/ingest/text` endpoint.

Verify: `cd backend && python -c "from main import app; print('OK')"`

Commit: `git add backend/ingest/chunker.py backend/main.py && git commit -m "feat: apply user chunk settings at ingestion"`

---

### Task 7: Frontend — API functions

**Files:** Modify `frontend/src/hooks/useChat.js`

Add:
```javascript
export async function getSettings() {
  const res = await fetch(`${API_BASE}/settings`);
  if (!res.ok) throw new Error("Failed to load settings");
  return res.json();
}

export async function updateSettings(settings) {
  const res = await fetch(`${API_BASE}/settings`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(settings),
  });
  if (!res.ok) throw new Error("Failed to save settings");
  return res.json();
}
```

Commit: `git add frontend/src/hooks/useChat.js && git commit -m "feat: add getSettings, updateSettings API functions"`

---

### Task 8: Frontend — SettingsModal.jsx

**Files:** Create `frontend/src/components/SettingsModal.jsx`

Create the component from the spec (section 4). It includes:
- Three sections: Retrieval (top_k, similarity_threshold), Generation (temperature, max_tokens), System Prompt (textarea)
- Ingestion section: chunk_size, chunk_overlap
- SettingSlider sub-component for numeric values
- Save/Cancel buttons
- Reset per-setting functionality

Commit: `git add frontend/src/components/SettingsModal.jsx && git commit -m "feat: add SettingsModal component"`

---

### Task 9: Frontend — Sidebar integration

**Files:** Modify `frontend/src/components/Sidebar.jsx`

Add imports:
```jsx
import { Settings as SettingsIcon } from "lucide-react";
import SettingsModal from "./SettingsModal";
```

Add state:
```jsx
const [showSettings, setShowSettings] = useState(false);
```

Add settings button in the sidebar footer area (near SystemStatus or the bottom section):
```jsx
<button
  onClick={() => setShowSettings(true)}
  className="flex items-center gap-1.5 px-2.5 py-1 text-fg-muted hover:text-accent text-[11px] font-sans transition-colors"
  aria-label="Open settings"
>
  <SettingsIcon size={12} aria-hidden="true" />
  Settings
</button>
```

Render modal at bottom:
```jsx
{showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
```

Verify: `cd frontend && npm run build`

Commit: `git add frontend/src/components/Sidebar.jsx && git commit -m "feat: add settings button + modal to Sidebar"`

---

### Task 10: Final build + push

- [ ] `cd frontend && npm run build`
- [ ] `cd backend && python -c "from main import app; print('OK')"`
- [ ] `git push origin main`
