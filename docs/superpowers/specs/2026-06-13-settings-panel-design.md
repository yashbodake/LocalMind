# C5 — Settings Panel Design Spec

**Date:** 2026-06-13  
**Status:** Draft  
**Depends on:** Nothing (independent)  
**Required by:** Nothing

## Problem

All settings are locked in `config.yaml`. Users have zero control from the UI over retrieval parameters, LLM behavior, system prompt, or chunking. Power users can't tune the system.

## Solution

A settings modal with three sections: (1) Retrieval (top_k, similarity_threshold), (2) Generation (temperature, max_tokens, system prompt override), (3) Ingestion (chunk_size, chunk_overlap). Settings stored in SQLite, merged with config.yaml defaults at runtime.

## Architecture

```
Backend Changes:
  database.py
    └─ settings table (key TEXT PRIMARY KEY, value TEXT, updated_at TEXT)
    └─ get_setting(key), set_setting(key, value), get_all_settings()
  routes/settings.py (new)
    └─ GET /settings → returns merged defaults + overrides
    └─ PUT /settings → updates user settings
  llm/generator.py
    └─ generate/stream: apply user temperature, max_tokens, system prompt
  retrieval/retriever.py
    └─ retrieve: apply user top_k, similarity_threshold
  main.py
    └─ include settings router
    └─ POST /ingest: apply user chunk_size, chunk_overlap

Frontend Changes:
  SettingsModal.jsx (new)
    └─ Three sections with sliders/inputs/textarea
  Sidebar.jsx
    └─ Settings button (gear icon) opens modal
  useChat.js
    └─ getSettings(), updateSettings()
```

## 1. Settings Storage

### SQLite table

```sql
CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
```

### database.py functions

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

## 2. Backend — Settings API

### `routes/settings.py` (new)

```python
import logging
from fastapi import APIRouter
from pydantic import BaseModel

from database import get_all_settings, set_setting
from llm.client import load_config

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/settings", tags=["settings"])


DEFAULTS = {
    "retrieval.top_k": "retrieval.top_k",
    "retrieval.similarity_threshold": "retrieval.similarity_threshold",
    "llm.temperature": "llm.temperature",
    "llm.max_tokens": "llm.max_tokens",
    "llm.system_prompt": "llm.system_prompt",
    "chunking.chunk_size": "chunking.chunk_size",
    "chunking.chunk_overlap": "chunking.chunk_overlap",
}


class SettingsUpdate(BaseModel):
    settings: dict[str, str]


@router.get("")
async def get_settings():
    config = load_config()
    user_settings = get_all_settings()

    return {
        "defaults": {
            "retrieval.top_k": config["retrieval"]["top_k"],
            "retrieval.similarity_threshold": config["retrieval"]["similarity_threshold"],
            "llm.temperature": config["llm"]["temperature"],
            "llm.max_tokens": config["llm"]["max_tokens"],
            "llm.system_prompt": "",
            "chunking.chunk_size": config["chunking"]["chunk_size"],
            "chunking.chunk_overlap": config["chunking"]["chunk_overlap"],
        },
        "overrides": user_settings,
        "effective": {
            key: user_settings.get(key, str(default_val))
            for key, default_val in {
                "retrieval.top_k": config["retrieval"]["top_k"],
                "retrieval.similarity_threshold": config["retrieval"]["similarity_threshold"],
                "llm.temperature": config["llm"]["temperature"],
                "llm.max_tokens": config["llm"]["max_tokens"],
                "llm.system_prompt": "",
                "chunking.chunk_size": config["chunking"]["chunk_size"],
                "chunking.chunk_overlap": config["chunking"]["chunk_overlap"],
            }.items()
        },
    }


@router.put("")
async def update_settings(payload: SettingsUpdate):
    for key, value in payload.settings.items():
        if key in DEFAULTS:
            if value.strip() == "":
                set_setting(key, "")  # empty = reset to default
            else:
                set_setting(key, value)
    return {"status": "ok"}
```

### Wire into main.py

```python
from routes.settings import router as settings_router
app.include_router(settings_router)
```

## 3. Backend — Apply Settings at Runtime

### `llm/generator.py` — apply user overrides

Create a helper to get effective settings:

```python
from database import get_setting

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

In `generate()` and `stream()`, replace the lines that read temperature/max_tokens from config:

```python
temperature, max_tokens, use_model = _get_effective_llm_params(model)
```

And in `_build_messages()`, use the effective system prompt:

```python
def _build_messages(question, chunks, history=None):
    context = _build_context(chunks)
    messages = [{"role": "system", "content": _get_effective_system_prompt()}]
    ...
```

### `retrieval/retriever.py` — apply user overrides

```python
from database import get_setting

def retrieve(question, top_k=None, doc_ids=None):
    config = _load_config()
    retrieval_cfg = config["retrieval"]

    user_top_k = get_setting("retrieval.top_k")
    user_threshold = get_setting("retrieval.similarity_threshold")

    effective_top_k = int(user_top_k) if user_top_k else retrieval_cfg["top_k"]
    effective_threshold = float(user_threshold) if user_threshold else retrieval_cfg["similarity_threshold"]

    if top_k is None:
        top_k = effective_top_k

    threshold = effective_threshold
    ...
```

### `main.py` — apply chunk settings at ingestion

```python
from database import get_setting

# In ingest_files, before chunk_text:
user_chunk_size = get_setting("chunking.chunk_size")
user_chunk_overlap = get_setting("chunking.chunk_overlap")
chunk_size = int(user_chunk_size) if user_chunk_size else config["chunking"]["chunk_size"]
chunk_overlap = int(user_chunk_overlap) if user_chunk_overlap else config["chunking"]["chunk_overlap"]
chunks = chunk_text(text, chunk_size=chunk_size, chunk_overlap=chunk_overlap)
```

This requires `chunk_text` to accept optional `chunk_size` and `chunk_overlap` parameters. Check current signature — if it only uses config, add optional params.

## 4. Frontend — SettingsModal.jsx

```jsx
import { useState, useEffect } from "react";
import { X, Settings } from "lucide-react";
import { getSettings, updateSettings } from "../hooks/useChat";

export default function SettingsModal({ onClose }) {
  const [settings, setSettings] = useState({});
  const [defaults, setDefaults] = useState({});
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    getSettings()
      .then((data) => {
        setSettings(data.effective || {});
        setDefaults(data.defaults || {});
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  const handleChange = (key, value) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateSettings({ settings });
      onClose();
    } catch (e) {
      console.error("Failed to save settings:", e);
    } finally {
      setSaving(false);
    }
  };

  const handleReset = (key) => {
    handleChange(key, String(defaults[key] ?? ""));
  };

  const isOverridden = (key) => settings[key] !== String(defaults[key] ?? "");

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-surface border border-line rounded-2xl w-full max-w-lg max-h-[85vh] flex flex-col mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-5 py-3 border-b border-line">
          <Settings size={16} className="text-accent" aria-hidden="true" />
          <h3 className="text-fg text-sm font-semibold">Settings</h3>
          <button
            onClick={onClose}
            className="ml-auto p-1.5 rounded-lg text-fg-muted hover:text-fg hover:bg-elevated transition-colors"
            aria-label="Close settings"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6">
          {!loaded ? (
            <p className="text-fg-muted text-sm">Loading…</p>
          ) : (
            <>
              {/* Retrieval Section */}
              <div className="space-y-3">
                <h4 className="font-mono text-[10px] uppercase tracking-wider text-fg-muted">
                  Retrieval
                </h4>
                <SettingSlider
                  label="Top K"
                  value={settings["retrieval.top_k"] || ""}
                  defaultValue={defaults["retrieval.top_k"]}
                  onChange={(v) => handleChange("retrieval.top_k", v)}
                  onReset={() => handleReset("retrieval.top_k")}
                  overridden={isOverridden("retrieval.top_k")}
                  min={1} max={20} step={1}
                />
                <SettingSlider
                  label="Similarity Threshold"
                  value={settings["retrieval.similarity_threshold"] || ""}
                  defaultValue={defaults["retrieval.similarity_threshold"]}
                  onChange={(v) => handleChange("retrieval.similarity_threshold", v)}
                  onReset={() => handleReset("retrieval.similarity_threshold")}
                  overridden={isOverridden("retrieval.similarity_threshold")}
                  min={0} max={1} step={0.05}
                />
              </div>

              {/* Generation Section */}
              <div className="space-y-3">
                <h4 className="font-mono text-[10px] uppercase tracking-wider text-fg-muted">
                  Generation
                </h4>
                <SettingSlider
                  label="Temperature"
                  value={settings["llm.temperature"] || ""}
                  defaultValue={defaults["llm.temperature"]}
                  onChange={(v) => handleChange("llm.temperature", v)}
                  onReset={() => handleReset("llm.temperature")}
                  overridden={isOverridden("llm.temperature")}
                  min={0} max={2} step={0.1}
                />
                <SettingSlider
                  label="Max Tokens"
                  value={settings["llm.max_tokens"] || ""}
                  defaultValue={defaults["llm.max_tokens"]}
                  onChange={(v) => handleChange("llm.max_tokens", v)}
                  onReset={() => handleReset("llm.max_tokens")}
                  overridden={isOverridden("llm.max_tokens")}
                  min={128} max={4096} step={128}
                />
              </div>

              {/* System Prompt Section */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="font-mono text-[10px] uppercase tracking-wider text-fg-muted">
                    System Prompt Override
                  </h4>
                  {isOverridden("llm.system_prompt") && (
                    <button
                      onClick={() => handleReset("llm.system_prompt")}
                      className="text-[10px] text-accent hover:text-accent/80 font-sans"
                    >
                      Reset
                    </button>
                  )}
                </div>
                <textarea
                  value={settings["llm.system_prompt"] || ""}
                  onChange={(e) => handleChange("llm.system_prompt", e.target.value)}
                  placeholder="Leave empty to use default system prompt…"
                  rows={4}
                  className="w-full bg-base border border-line rounded-lg px-3 py-2 text-fg text-xs outline-none focus:border-accent/30 resize-none font-mono"
                  aria-label="Custom system prompt"
                />
              </div>

              {/* Ingestion Section */}
              <div className="space-y-3">
                <h4 className="font-mono text-[10px] uppercase tracking-wider text-fg-muted">
                  Ingestion (applies to new uploads only)
                </h4>
                <SettingSlider
                  label="Chunk Size"
                  value={settings["chunking.chunk_size"] || ""}
                  defaultValue={defaults["chunking.chunk_size"]}
                  onChange={(v) => handleChange("chunking.chunk_size", v)}
                  onReset={() => handleReset("chunking.chunk_size")}
                  overridden={isOverridden("chunking.chunk_size")}
                  min={128} max={2048} step={64}
                />
                <SettingSlider
                  label="Chunk Overlap"
                  value={settings["chunking.chunk_overlap"] || ""}
                  defaultValue={defaults["chunking.chunk_overlap"]}
                  onChange={(v) => handleChange("chunking.chunk_overlap", v)}
                  onReset={() => handleReset("chunking.chunk_overlap")}
                  overridden={isOverridden("chunking.chunk_overlap")}
                  min={0} max={512} step={32}
                />
              </div>
            </>
          )}
        </div>

        <div className="flex justify-end gap-2 px-5 py-3 border-t border-line">
          <button
            onClick={onClose}
            className="px-3 py-1.5 border border-line rounded-lg text-fg-muted hover:text-fg text-xs transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !loaded}
            className="px-3 py-1.5 border border-accent/30 bg-accent/10 rounded-lg text-accent text-xs disabled:opacity-30 transition-colors"
          >
            {saving ? "Saving…" : "Save Settings"}
          </button>
        </div>
      </div>
    </div>
  );
}

function SettingSlider({ label, value, defaultValue, onChange, onReset, overridden, min, max, step }) {
  const numValue = parseFloat(value) || 0;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className="text-fg-secondary text-xs font-sans">{label}</span>
          {overridden && (
            <button
              onClick={onReset}
              className="text-[9px] text-accent hover:text-accent/80 font-sans"
            >
              reset
            </button>
          )}
        </div>
        <span className="font-mono text-[10px] text-accent">{value || defaultValue}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={numValue}
        onChange={(e) => onChange(e.target.value)}
        className="w-full accent-accent h-1"
        aria-label={label}
      />
    </div>
  );
}
```

## 5. Frontend — useChat.js additions

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

## 6. Frontend — Sidebar integration

Add a settings button (gear icon) in the Sidebar footer or header:

```jsx
import { Settings as SettingsIcon } from "lucide-react";
import SettingsModal from "./SettingsModal";

const [showSettings, setShowSettings] = useState(false);

// In the sidebar footer/header:
<button
  onClick={() => setShowSettings(true)}
  className="flex items-center gap-1.5 px-2.5 py-1 text-fg-muted hover:text-accent text-[11px] font-sans transition-colors"
  aria-label="Open settings"
>
  <SettingsIcon size={12} aria-hidden="true" />
  Settings
</button>

// At bottom of component:
{showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
```

## 7. Backend — chunk_text parameter update

Check `backend/ingest/chunker.py`. If `chunk_text` doesn't accept `chunk_size` and `chunk_overlap` params, add them as optional:

```python
def chunk_text(text: str, chunk_size: int | None = None, chunk_overlap: int | None = None) -> list[str]:
    config = _load_config()
    chunking_cfg = config["chunking"]
    
    use_size = chunk_size or chunking_cfg["chunk_size"]
    use_overlap = chunk_overlap or chunking_cfg["chunk_overlap"]
    
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=use_size,
        chunk_overlap=use_overlap,
        separators=chunking_cfg["separators"],
    )
    return splitter.split_text(text)
```

## Error Handling

| Scenario | Behavior |
|---|---|
| Invalid setting value (e.g. non-numeric top_k) | Backend tries to cast, falls back to config default on failure |
| Settings table doesn't exist yet | init_db creates it on startup |
| Save fails | Error logged, modal stays open |
| System prompt empty | Uses default from generator.py |

## Constraints

- Settings are global (not per-session or per-user) — acceptable for single-user local app
- Chunk size/overlap only apply to new uploads, not existing documents
- System prompt override replaces the entire default prompt
- Settings stored as strings, cast to appropriate types at read time
- config.yaml remains the source of defaults — settings table only stores overrides
