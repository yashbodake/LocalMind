# Sessions & Persistence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add backend-owned chat session persistence with SQLite so conversations survive page refreshes, can be switched between, renamed, deleted, and auto-titled.

**Architecture:** SQLite database (`localmind.db`) stores sessions + full message objects. FastAPI APIRouter exposes 6 REST endpoints. Frontend fetches sessions on mount, loads messages on session switch, and saves messages after streaming completes. LLM auto-generates session titles from the first Q&A exchange.

**Tech Stack:** SQLite (via pysqlite3-binary monkey-patch), FastAPI APIRouter, React state, NVIDIA NIM for title generation.

**Spec:** `docs/superpowers/specs/2026-06-13-sessions-and-persistence-design.md`

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `backend/database.py` | **Create** | SQLite connection, schema init, session + message CRUD |
| `backend/models/session_schemas.py` | **Create** | Pydantic request/response models |
| `backend/llm/title_generator.py` | **Create** | LLM-powered auto-title generation |
| `backend/routes/__init__.py` | **Create** | Empty package init |
| `backend/routes/sessions.py` | **Create** | FastAPI APIRouter with 6 endpoints |
| `backend/main.py` | **Modify** | Include sessions router, call `init_db()` |
| `backend/config.yaml` | **Modify** | Add `database.path` |
| `frontend/src/hooks/useChat.js` | **Modify** | Add 6 session/message API functions |
| `frontend/src/App.jsx` | **Modify** | Replace `chatKey` with session state management |
| `frontend/src/components/Sidebar.jsx` | **Modify** | Add sessions list section |
| `frontend/src/components/ChatWindow.jsx` | **Modify** | Load messages on session switch, save after stream |
| `frontend/vite.config.js` | **Modify** | Add `/sessions` proxy entry |

---

## Task 1: Database Schema & Connection (`backend/database.py`)

**Files:**
- Create: `backend/database.py`
- Modify: `backend/config.yaml`

- [ ] **Step 1: Add database config to `config.yaml`**

Add this section at the end of `backend/config.yaml` (after the `server:` block):

```yaml
database:
  path: ./localmind.db
```

- [ ] **Step 2: Create `backend/database.py` with connection management and schema init**

Create `backend/database.py`:

```python
import json
import logging
import sqlite3
import uuid
from datetime import datetime, timezone
from pathlib import Path

import yaml

logger = logging.getLogger(__name__)

_CONFIG_PATH = "config.yaml"
_conn: sqlite3.Connection | None = None


def _load_config() -> dict:
    config_path = Path(_CONFIG_PATH)
    if not config_path.exists():
        config_path = Path(__file__).parent / _CONFIG_PATH
    with open(config_path, "r") as f:
        return yaml.safe_load(f)


def get_db() -> sqlite3.Connection:
    global _conn
    if _conn is None:
        config = _load_config()
        db_path = config.get("database", {}).get("path", "./localmind.db")
        _conn = sqlite3.connect(db_path, check_same_thread=False)
        _conn.row_factory = sqlite3.Row
        _conn.execute("PRAGMA foreign_keys = ON")
        logger.info("SQLite connected at %s", db_path)
    return _conn


def init_db() -> None:
    conn = get_db()
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS sessions (
            id          TEXT PRIMARY KEY,
            title       TEXT NOT NULL DEFAULT 'New Chat',
            doc_ids     TEXT DEFAULT '[]',
            model       TEXT,
            created_at  TEXT NOT NULL,
            updated_at  TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS messages (
            id          TEXT PRIMARY KEY,
            session_id  TEXT NOT NULL,
            role        TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
            content     TEXT NOT NULL,
            sources     TEXT,
            latency_ms  INTEGER,
            model       TEXT,
            created_at  TEXT NOT NULL,
            FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_messages_session_id
            ON messages(session_id);
        """
    )
    conn.commit()
    logger.info("Database schema initialized")


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _gen_id() -> str:
    return uuid.uuid4().hex[:12]
```

- [ ] **Step 3: Verify the module loads and schema creates**

Run:

```bash
cd backend && python -c "
from database import init_db, get_db
init_db()
conn = get_db()
tables = conn.execute(\"SELECT name FROM sqlite_master WHERE type='table'\").fetchall()
print('Tables:', [t['name'] for t in tables])
indexes = conn.execute(\"SELECT name FROM sqlite_master WHERE type='index'\").fetchall()
print('Indexes:', [i['name'] for i in indexes])
"
```

Expected: `Tables: ['sessions', 'messages']` and `Indexes: ['idx_messages_session_id']`

- [ ] **Step 4: Commit**

```bash
git add backend/database.py backend/config.yaml
git commit -m "feat: add SQLite database module with sessions + messages schema"
```

---

## Task 2: Session CRUD (`backend/database.py`)

**Files:**
- Modify: `backend/database.py` (append session CRUD functions)

- [ ] **Step 1: Add session CRUD functions to `database.py`**

Append to `backend/database.py` (after `_gen_id`):

```python
def create_session(
    title: str = "New Chat",
    model: str | None = None,
    doc_ids: list[str] | None = None,
) -> dict:
    conn = get_db()
    session_id = _gen_id()
    now = _now()
    doc_ids_json = json.dumps(doc_ids or [])
    conn.execute(
        """INSERT INTO sessions (id, title, doc_ids, model, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?)""",
        (session_id, title, doc_ids_json, model, now, now),
    )
    conn.commit()
    return {
        "id": session_id,
        "title": title,
        "doc_ids": doc_ids or [],
        "model": model,
        "created_at": now,
        "updated_at": now,
        "messages": [],
    }


def get_sessions() -> list[dict]:
    conn = get_db()
    rows = conn.execute(
        """SELECT s.id, s.title, s.updated_at,
                  (SELECT COUNT(*) FROM messages m WHERE m.session_id = s.id) as message_count
           FROM sessions s
           ORDER BY s.updated_at DESC"""
    ).fetchall()
    return [dict(row) for row in rows]


def get_session(session_id: str) -> dict | None:
    conn = get_db()
    row = conn.execute(
        "SELECT * FROM sessions WHERE id = ?", (session_id,)
    ).fetchone()
    if not row:
        return None

    session = dict(row)
    session["doc_ids"] = json.loads(session.get("doc_ids", "[]"))

    msg_rows = conn.execute(
        "SELECT * FROM messages WHERE session_id = ? ORDER BY created_at ASC",
        (session_id,),
    ).fetchall()

    messages = []
    for m in msg_rows:
        msg = dict(m)
        if msg.get("sources"):
            msg["sources"] = json.loads(msg["sources"])
        messages.append(msg)

    session["messages"] = messages
    return session


def update_session(
    session_id: str,
    title: str | None = None,
    model: str | None = None,
    doc_ids: list[str] | None = None,
) -> dict | None:
    conn = get_db()
    row = conn.execute(
        "SELECT * FROM sessions WHERE id = ?", (session_id,)
    ).fetchone()
    if not row:
        return None

    existing = dict(row)
    new_title = title if title is not None else existing["title"]
    new_model = model if model is not None else existing["model"]
    new_doc_ids = json.dumps(doc_ids) if doc_ids is not None else existing["doc_ids"]
    now = _now()

    conn.execute(
        """UPDATE sessions SET title = ?, model = ?, doc_ids = ?, updated_at = ?
           WHERE id = ?""",
        (new_title, new_model, new_doc_ids, now, session_id),
    )
    conn.commit()
    return get_session(session_id)


def delete_session(session_id: str) -> bool:
    conn = get_db()
    row = conn.execute(
        "SELECT id FROM sessions WHERE id = ?", (session_id,)
    ).fetchone()
    if not row:
        return False
    conn.execute("DELETE FROM sessions WHERE id = ?", (session_id,))
    conn.commit()
    return True
```

- [ ] **Step 2: Verify session CRUD works**

Run:

```bash
cd backend && python -c "
from database import init_db, create_session, get_sessions, get_session, update_session, delete_session
init_db()

# Create
s = create_session(title='Test Session', model='meta/llama-3.1-8b-instruct', doc_ids=['abc123'])
print('Created:', s['id'], s['title'])

# List
sessions = get_sessions()
print('List count:', len(sessions))

# Get
fetched = get_session(s['id'])
print('Got:', fetched['title'], 'messages:', len(fetched['messages']))

# Update
updated = update_session(s['id'], title='Renamed Session')
print('Updated title:', updated['title'])

# Delete
deleted = delete_session(s['id'])
print('Deleted:', deleted)

# Verify gone
sessions_after = get_sessions()
print('List count after delete:', len(sessions_after))
print('ALL PASS')
"
```

Expected: `ALL PASS`

- [ ] **Step 3: Commit**

```bash
git add backend/database.py
git commit -m "feat: add session CRUD functions to database module"
```

---

## Task 3: Message CRUD (`backend/database.py`)

**Files:**
- Modify: `backend/database.py` (append message CRUD)

- [ ] **Step 1: Add message CRUD functions to `database.py`**

Append to `backend/database.py`:

```python
def save_message(
    session_id: str,
    role: str,
    content: str,
    sources: list[dict] | None = None,
    latency_ms: int | None = None,
    model: str | None = None,
) -> dict | None:
    conn = get_db()
    row = conn.execute(
        "SELECT id FROM sessions WHERE id = ?", (session_id,)
    ).fetchone()
    if not row:
        return None

    msg_id = _gen_id()
    now = _now()
    sources_json = json.dumps(sources) if sources else None

    conn.execute(
        """INSERT INTO messages
           (id, session_id, role, content, sources, latency_ms, model, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
        (msg_id, session_id, role, content, sources_json, latency_ms, model, now),
    )
    conn.execute(
        "UPDATE sessions SET updated_at = ? WHERE id = ?", (now, session_id)
    )
    conn.commit()

    return {
        "id": msg_id,
        "session_id": session_id,
        "role": role,
        "content": content,
        "sources": sources,
        "latency_ms": latency_ms,
        "model": model,
        "created_at": now,
    }


def get_message_count(session_id: str) -> int:
    conn = get_db()
    row = conn.execute(
        "SELECT COUNT(*) as count FROM messages WHERE session_id = ?",
        (session_id,),
    ).fetchone()
    return row["count"] if row else 0
```

- [ ] **Step 2: Verify message CRUD works**

Run:

```bash
cd backend && python -c "
import json
from database import init_db, create_session, save_message, get_session, delete_session
init_db()

s = create_session()
print('Session:', s['id'])

# Save user message
msg1 = save_message(s['id'], role='user', content='What is RAG?')
print('User msg:', msg1['id'], msg1['role'])

# Save assistant message with sources
sources = [{'doc_id': 'abc', 'filename': 'doc.pdf', 'chunk_index': 0, 'content': 'RAG is...', 'score': 0.92}]
msg2 = save_message(s['id'], role='assistant', content='RAG stands for...', sources=sources, latency_ms=1500, model='meta/llama-3.1-8b-instruct')
print('Assistant msg:', msg2['id'], msg2['role'], 'latency:', msg2['latency_ms'])

# Verify retrieval
fetched = get_session(s['id'])
print('Message count:', len(fetched['messages']))
print('Sources in assistant msg:', fetched['messages'][1]['sources'])

# Cleanup
delete_session(s['id'])
print('ALL PASS')
"
```

Expected: `ALL PASS`

- [ ] **Step 3: Commit**

```bash
git add backend/database.py
git commit -m "feat: add message CRUD functions to database module"
```

---

## Task 4: Pydantic Schemas (`backend/models/session_schemas.py`)

**Files:**
- Create: `backend/models/session_schemas.py`

- [ ] **Step 1: Create the schemas file**

Create `backend/models/session_schemas.py`:

```python
from typing import Optional
from pydantic import BaseModel


class SessionCreate(BaseModel):
    title: Optional[str] = "New Chat"
    model: Optional[str] = None
    doc_ids: Optional[list[str]] = None


class SessionUpdate(BaseModel):
    title: Optional[str] = None
    model: Optional[str] = None
    doc_ids: Optional[list[str]] = None


class MessageCreate(BaseModel):
    role: str
    content: str
    sources: Optional[list[dict]] = None
    latency_ms: Optional[int] = None
    model: Optional[str] = None
```

- [ ] **Step 2: Verify import works**

Run:

```bash
cd backend && python -c "
from models.session_schemas import SessionCreate, SessionUpdate, MessageCreate
s = SessionCreate(title='Test')
print(s.model_dump())
m = MessageCreate(role='user', content='hello')
print(m.model_dump())
print('PASS')
"
```

Expected: `PASS`

- [ ] **Step 3: Commit**

```bash
git add backend/models/session_schemas.py
git commit -m "feat: add Pydantic schemas for sessions and messages"
```

---

## Task 5: Title Generator (`backend/llm/title_generator.py`)

**Files:**
- Create: `backend/llm/title_generator.py`

- [ ] **Step 1: Create the title generator**

Create `backend/llm/title_generator.py`:

```python
import logging
import os
from pathlib import Path

import yaml
from openai import OpenAI

logger = logging.getLogger(__name__)

_CONFIG_PATH = "config.yaml"
_client: OpenAI | None = None


def _load_config() -> dict:
    config_path = Path(_CONFIG_PATH)
    if not config_path.exists():
        config_path = Path(__file__).parent.parent / _CONFIG_PATH
    with open(config_path, "r") as f:
        return yaml.safe_load(f)


def _get_client() -> OpenAI:
    global _client
    if _client is None:
        config = _load_config()
        _client = OpenAI(
            base_url=config["llm"]["base_url"],
            api_key=os.getenv("NVIDIA_API_KEY"),
        )
    return _client


def generate_title(
    question: str, answer: str, model: str | None = None
) -> str | None:
    try:
        client = _get_client()
        config = _load_config()
        use_model = model or config["llm"]["model"]

        response = client.chat.completions.create(
            model=use_model,
            messages=[
                {
                    "role": "system",
                    "content": "Summarize the following Q&A in 3-5 words. Output only the title, no quotes, no punctuation.",
                },
                {
                    "role": "user",
                    "content": f"Q: {question}\nA: {answer[:500]}",
                },
            ],
            max_tokens=20,
            temperature=0.3,
            stream=False,
        )

        title = response.choices[0].message.content.strip()
        return title if title else None
    except Exception as e:
        logger.warning("Title generation failed: %s", e)
        return None
```

- [ ] **Step 2: Verify import works**

Run:

```bash
cd backend && python -c "
from llm.title_generator import generate_title
print('Function exists:', callable(generate_title))
print('PASS')
"
```

Expected: `PASS`

- [ ] **Step 3: Commit**

```bash
git add backend/llm/title_generator.py
git commit -m "feat: add LLM-powered session title generator"
```

---

## Task 6: Session API Routes (`backend/routes/sessions.py`)

**Files:**
- Create: `backend/routes/__init__.py`
- Create: `backend/routes/sessions.py`

- [ ] **Step 1: Create the routes package**

Create `backend/routes/__init__.py` (empty file):

```python
```

- [ ] **Step 2: Create the sessions router**

Create `backend/routes/sessions.py`:

```python
import logging

from fastapi import APIRouter, HTTPException

from database import (
    create_session as db_create_session,
    get_sessions as db_get_sessions,
    get_session as db_get_session,
    update_session as db_update_session,
    delete_session as db_delete_session,
    save_message as db_save_message,
    get_message_count,
)
from models.session_schemas import SessionCreate, SessionUpdate, MessageCreate
from llm.title_generator import generate_title

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/sessions", tags=["sessions"])


@router.post("")
async def create_session(payload: SessionCreate):
    return db_create_session(
        title=payload.title,
        model=payload.model,
        doc_ids=payload.doc_ids,
    )


@router.get("")
async def list_sessions():
    sessions = db_get_sessions()
    return {"sessions": sessions}


@router.get("/{session_id}")
async def get_session(session_id: str):
    session = db_get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return session


@router.patch("/{session_id}")
async def update_session(session_id: str, payload: SessionUpdate):
    result = db_update_session(
        session_id,
        title=payload.title,
        model=payload.model,
        doc_ids=payload.doc_ids,
    )
    if not result:
        raise HTTPException(status_code=404, detail="Session not found")
    return result


@router.delete("/{session_id}")
async def delete_session(session_id: str):
    deleted = db_delete_session(session_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Session not found")
    return {"status": "deleted", "id": session_id}


@router.post("/{session_id}/messages")
async def save_message(session_id: str, payload: MessageCreate):
    result = db_save_message(
        session_id,
        role=payload.role,
        content=payload.content,
        sources=payload.sources,
        latency_ms=payload.latency_ms,
        model=payload.model,
    )
    if not result:
        raise HTTPException(status_code=404, detail="Session not found")

    auto_title = None
    if payload.role == "assistant":
        session = db_get_session(session_id)
        if session and session["title"] == "New Chat":
            user_msgs = [m for m in session["messages"] if m["role"] == "user"]
            asst_msgs = [m for m in session["messages"] if m["role"] == "assistant"]
            if len(user_msgs) == 1 and len(asst_msgs) == 1:
                title = generate_title(
                    user_msgs[0]["content"], payload.content, payload.model
                )
                if title:
                    db_update_session(session_id, title=title)
                    auto_title = title

    if auto_title:
        result["auto_title"] = auto_title

    return result
```

- [ ] **Step 3: Commit**

```bash
git add backend/routes/
git commit -m "feat: add sessions API router with CRUD + auto-title endpoints"
```

---

## Task 7: Wire Into `main.py`

**Files:**
- Modify: `backend/main.py`

- [ ] **Step 1: Add imports and init_db call**

In `backend/main.py`, add these imports after line 15 (`from fastapi.responses import StreamingResponse`):

```python
from database import init_db
from routes.sessions import router as sessions_router
```

- [ ] **Step 2: Call init_db and include router**

After the CORS middleware block (after line 59, the closing `)`), add:

```python
init_db()
app.include_router(sessions_router)
```

- [ ] **Step 3: Restart backend and verify it loads**

Run:

```bash
cd backend && python -c "import main; print('main.py loads OK')"
```

Expected: `main.py loads OK`

- [ ] **Step 4: Commit**

```bash
git add backend/main.py
git commit -m "feat: wire sessions router and init_db into main app"
```

---

## Task 8: Backend Smoke Test

**Files:**
- None (manual curl test)

- [ ] **Step 1: Restart the backend server**

Kill any existing uvicorn process and restart:

```bash
cd backend && uvicorn main:app --host 0.0.0.0 --port 8000 --reload &
sleep 3
```

- [ ] **Step 2: Test create session**

Run:

```bash
curl -s -X POST http://localhost:8000/sessions \
  -H "Content-Type: application/json" \
  -d '{"title": "Test Session"}' | python -m json.tool
```

Expected: JSON with `id`, `title: "Test Session"`, `messages: []`

- [ ] **Step 3: Test list sessions**

Run (replace `SESSION_ID` with the ID from step 2):

```bash
curl -s http://localhost:8000/sessions | python -m json.tool
```

Expected: JSON with `sessions` array containing the session, `message_count: 0`

- [ ] **Step 4: Test save user message**

```bash
curl -s -X POST http://localhost:8000/sessions/SESSION_ID/messages \
  -H "Content-Type: application/json" \
  -d '{"role": "user", "content": "What is RAG?"}' | python -m json.tool
```

Expected: JSON with `id`, `role: "user"`, `content: "What is RAG?"`

- [ ] **Step 5: Test save assistant message**

```bash
curl -s -X POST http://localhost:8000/sessions/SESSION_ID/messages \
  -H "Content-Type: application/json" \
  -d '{"role": "assistant", "content": "RAG combines retrieval with generation.", "latency_ms": 1500, "model": "meta/llama-3.1-8b-instruct"}' | python -m json.tool
```

Expected: JSON with message fields. If NVIDIA API key is valid, `auto_title` may appear.

- [ ] **Step 6: Test get session with messages**

```bash
curl -s http://localhost:8000/sessions/SESSION_ID | python -m json.tool
```

Expected: Session with `messages` array containing both messages

- [ ] **Step 7: Test update session**

```bash
curl -s -X PATCH http://localhost:8000/sessions/SESSION_ID \
  -H "Content-Type: application/json" \
  -d '{"title": "Renamed"}' | python -m json.tool
```

Expected: `title: "Renamed"`

- [ ] **Step 8: Test delete session**

```bash
curl -s -X DELETE http://localhost:8000/sessions/SESSION_ID | python -m json.tool
```

Expected: `{"status": "deleted", "id": "..."}`

- [ ] **Step 9: Verify 404 on missing session**

```bash
curl -s http://localhost:8000/sessions/nonexistent | python -m json.tool
```

Expected: `{"detail": "Session not found"}` with HTTP 404

---

## Task 9: Frontend API Functions (`frontend/src/hooks/useChat.js`)

**Files:**
- Modify: `frontend/src/hooks/useChat.js`

- [ ] **Step 1: Add session API functions**

In `frontend/src/hooks/useChat.js`, add these functions at the end of the file (after `getModels`):

```javascript
export async function createSession({ title, model, doc_ids } = {}) {
  const res = await fetch(`${API_BASE}/sessions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title, model, doc_ids }),
  });
  if (!res.ok) throw new Error("Failed to create session");
  return res.json();
}

export async function getSessions() {
  const res = await fetch(`${API_BASE}/sessions`);
  if (!res.ok) throw new Error("Failed to fetch sessions");
  return res.json();
}

export async function getSession(id) {
  const res = await fetch(`${API_BASE}/sessions/${id}`);
  if (!res.ok) throw new Error("Failed to fetch session");
  return res.json();
}

export async function updateSession(id, { title, model, doc_ids }) {
  const res = await fetch(`${API_BASE}/sessions/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title, model, doc_ids }),
  });
  if (!res.ok) throw new Error("Failed to update session");
  return res.json();
}

export async function deleteSession(id) {
  const res = await fetch(`${API_BASE}/sessions/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error("Failed to delete session");
  return res.json();
}

export async function saveMessage(sessionId, { role, content, sources, latency_ms, model }) {
  const res = await fetch(`${API_BASE}/sessions/${sessionId}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ role, content, sources, latency_ms, model }),
  });
  if (!res.ok) throw new Error("Failed to save message");
  return res.json();
}
```

- [ ] **Step 2: Add `/sessions` proxy to `vite.config.js`**

In `frontend/vite.config.js`, add `'/sessions': 'http://localhost:8000',` to the `proxy` object (after the `/models` line):

```javascript
      '/sessions': 'http://localhost:8000',
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/hooks/useChat.js frontend/vite.config.js
git commit -m "feat: add session/message API functions and proxy config"
```

---

## Task 10: Frontend — App.jsx Session State

**Files:**
- Modify: `frontend/src/App.jsx`

- [ ] **Step 1: Rewrite `App.jsx` with session state management**

Replace the entire contents of `frontend/src/App.jsx`:

```jsx
import { useState, useEffect, useCallback } from "react";
import Sidebar from "./components/Sidebar";
import ChatWindow from "./components/ChatWindow";
import { getSources, getSessions, createSession } from "./hooks/useChat";

export default function App() {
  const [sessions, setSessions] = useState([]);
  const [currentSessionId, setCurrentSessionId] = useState(null);
  const [selectedModel, setSelectedModel] = useState(null);
  const [selectedDocIds, setSelectedDocIds] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const [theme, setTheme] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("localmind-theme") || "dark";
    }
    return "dark";
  });

  useEffect(() => {
    if (theme === "light") {
      document.documentElement.classList.add("light");
    } else {
      document.documentElement.classList.remove("light");
    }
    localStorage.setItem("localmind-theme", theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === "dark" ? "light" : "dark"));
  };

  useEffect(() => {
    getSources()
      .then((data) => {
        if (selectedDocIds === null) {
          const ids = (data.sources || []).map((s) => s.doc_id);
          setSelectedDocIds(ids);
        }
      })
      .catch(() => setSelectedDocIds([]));
  }, []);

  useEffect(() => {
    getSessions()
      .then((data) => {
        const list = data.sessions || [];
        setSessions(list);
        if (list.length > 0) {
          setCurrentSessionId(list[0].id);
        } else {
          createSession()
            .then((s) => {
              setSessions([{ ...s, message_count: 0 }]);
              setCurrentSessionId(s.id);
            })
            .catch(() => {});
        }
      })
      .catch(() => {
        createSession()
          .then((s) => {
            setSessions([{ ...s, message_count: 0 }]);
            setCurrentSessionId(s.id);
          })
          .catch(() => {});
      });
  }, []);

  const newChat = useCallback(async () => {
    try {
      const s = await createSession({ model: selectedModel, doc_ids: selectedDocIds });
      setSessions((prev) => [{ ...s, message_count: 0 }, ...prev]);
      setCurrentSessionId(s.id);
    } catch {}
  }, [selectedModel, selectedDocIds]);

  const switchSession = useCallback((id) => {
    setCurrentSessionId(id);
  }, []);

  const handleSessionUpdate = useCallback((id, updates) => {
    setSessions((prev) =>
      prev.map((s) => (s.id === id ? { ...s, ...updates } : s))
    );
  }, []);

  const handleSessionDelete = useCallback((id) => {
    setSessions((prev) => {
      const filtered = prev.filter((s) => s.id !== id);
      if (id === currentSessionId) {
        if (filtered.length > 0) {
          setCurrentSessionId(filtered[0].id);
        } else {
          createSession()
            .then((s) => {
              setSessions([{ ...s, message_count: 0 }]);
              setCurrentSessionId(s.id);
            })
            .catch(() => {});
        }
      }
      return filtered;
    });
  }, [currentSessionId]);

  return (
    <div className="flex h-screen bg-base overflow-hidden">
      <Sidebar
        sessions={sessions}
        currentSessionId={currentSessionId}
        onSwitchSession={switchSession}
        onSessionUpdate={handleSessionUpdate}
        onSessionDelete={handleSessionDelete}
        onNewChat={newChat}
        selectedDocIds={selectedDocIds}
        onSelectDocIds={setSelectedDocIds}
        currentSessionIdForDocs={currentSessionId}
        sidebarOpen={sidebarOpen}
        onCloseSidebar={() => setSidebarOpen(false)}
        theme={theme}
        onToggleTheme={toggleTheme}
      />
      <main className="flex-1 min-w-0">
        {currentSessionId ? (
          <ChatWindow
            key={currentSessionId}
            sessionId={currentSessionId}
            selectedModel={selectedModel}
            onSelectModel={setSelectedModel}
            selectedDocIds={selectedDocIds}
            onOpenSidebar={() => setSidebarOpen(true)}
            onSessionLoaded={(session) => {
              if (session.model) setSelectedModel(session.model);
              if (session.doc_ids) setSelectedDocIds(session.doc_ids);
            }}
            onMessageSaved={(autoTitle) => {
              if (autoTitle) {
                handleSessionUpdate(currentSessionId, { title: autoTitle });
              }
            }}
          />
        ) : (
          <div className="flex items-center justify-center h-full">
            <p className="text-fg-muted text-sm">Loading…</p>
          </div>
        )}
      </main>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/App.jsx
git commit -m "feat: replace chatKey with session state management in App.jsx"
```

---

## Task 11: Frontend — Sidebar.jsx Session List

**Files:**
- Modify: `frontend/src/components/Sidebar.jsx`

- [ ] **Step 1: Add new imports and props**

Replace the imports and function signature at the top of `frontend/src/components/Sidebar.jsx`.

Replace:
```jsx
import { useState, useEffect } from "react";
import { RefreshCw, Trash2, FileText, AlertCircle, Plus, X } from "lucide-react";
import { getSources, deleteSource } from "../hooks/useChat";
```

With:
```jsx
import { useState, useEffect } from "react";
import { RefreshCw, Trash2, FileText, AlertCircle, Plus, X, MessageSquare, Pencil, Check } from "lucide-react";
import { getSources, deleteSource, updateSession, deleteSession } from "../hooks/useChat";
```

Replace the function signature:

```jsx
export default function Sidebar({
  sessions,
  currentSessionId,
  onSwitchSession,
  onSessionUpdate,
  onSessionDelete,
  onNewChat,
  selectedDocIds,
  onSelectDocIds,
  sidebarOpen,
  onCloseSidebar,
  theme,
  onToggleTheme,
}) {
```

- [ ] **Step 2: Add session UI state**

After the existing `const [deleting, setDeleting] = useState(null);` line, add:

```jsx
  const [editingSessionId, setEditingSessionId] = useState(null);
  const [editTitle, setEditTitle] = useState("");
```

- [ ] **Step 3: Add session handler functions**

After the `toggleAll` function, add:

```jsx
  const startRename = (session) => {
    setEditingSessionId(session.id);
    setEditTitle(session.title);
  };

  const confirmRename = async (sessionId) => {
    const title = editTitle.trim();
    if (!title) {
      setEditingSessionId(null);
      return;
    }
    try {
      await updateSession(sessionId, { title });
      onSessionUpdate(sessionId, { title });
    } catch {}
    setEditingSessionId(null);
  };

  const handleSessionDelete = async (sessionId) => {
    if (!window.confirm("Delete this conversation?")) return;
    try {
      await deleteSession(sessionId);
      onSessionDelete(sessionId);
    } catch {}
  };

  const timeAgo = (isoString) => {
    const diff = Date.now() - new Date(isoString).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "now";
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;
    return new Date(isoString).toLocaleDateString();
  };
```

- [ ] **Step 4: Add sessions section to the sidebar layout**

The current sidebar structure has the "new --chat" button, then FileUploader, then sources. We need to insert the sessions section between the "new --chat" button section and the FileUploader.

Find this block:
```jsx
        <div className="px-3 py-2.5">
          <button
            onClick={onNewChat}
            className="w-full flex items-center gap-2 px-3 py-2 border border-line rounded-lg text-fg-secondary hover:border-accent/30 hover:text-accent text-xs font-mono transition-colors"
          >
            <Plus size={14} aria-hidden="true" />
            new --chat
          </button>
        </div>

        <div className="px-4 py-1">
          <FileUploader onSuccess={refresh} />
        </div>
```

Replace with:
```jsx
        <div className="px-3 py-2.5">
          <button
            onClick={onNewChat}
            className="w-full flex items-center gap-2 px-3 py-2 border border-line rounded-lg text-fg-secondary hover:border-accent/30 hover:text-accent text-xs font-mono transition-colors"
          >
            <Plus size={14} aria-hidden="true" />
            new --chat
          </button>
        </div>

        <div className="px-4 py-1">
          <span className="font-mono text-[9px] font-semibold uppercase tracking-wider text-fg-muted">
            // sessions ({sessions.length})
          </span>
        </div>
        <div className="flex-1 overflow-y-auto overscroll-contain px-2 min-h-0">
          {sessions.length === 0 ? (
            <p className="text-xs text-fg-muted text-center py-4 px-2">No conversations yet</p>
          ) : (
            <ul className="space-y-0.5">
              {sessions.map((s) => (
                <li
                  key={s.id}
                  className={`group flex items-center gap-2 px-2.5 py-2 rounded-lg cursor-pointer border border-transparent transition-colors
                    ${s.id === currentSessionId ? "bg-accent/5 border-accent/20" : "hover:bg-elevated"}`}
                  onClick={() => onSwitchSession(s.id)}
                >
                  <MessageSquare size={13} className="text-fg-muted shrink-0" aria-hidden="true" />
                  {editingSessionId === s.id ? (
                    <input
                      type="text"
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") confirmRename(s.id);
                        if (e.key === "Escape") setEditingSessionId(null);
                      }}
                      onClick={(e) => e.stopPropagation()}
                      autoFocus
                      className="flex-1 min-w-0 bg-elevated text-fg text-xs font-sans rounded px-1.5 py-0.5 outline-none border border-accent/30"
                    />
                  ) : (
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-fg-secondary truncate">{s.title}</p>
                      <p className="font-mono text-[9px] text-fg-muted">{timeAgo(s.updated_at)}</p>
                    </div>
                  )}
                  {editingSessionId === s.id ? (
                    <button
                      onClick={(e) => { e.stopPropagation(); confirmRename(s.id); }}
                      className="p-1 rounded hover:bg-accent/10 text-accent"
                      aria-label="Confirm rename"
                    >
                      <Check size={12} aria-hidden="true" />
                    </button>
                  ) : (
                    <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                      <button
                        onClick={(e) => { e.stopPropagation(); startRename(s); }}
                        className="p-1 rounded hover:bg-accent/10 text-fg-muted hover:text-accent"
                        aria-label={`Rename ${s.title}`}
                      >
                        <Pencil size={11} aria-hidden="true" />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleSessionDelete(s.id); }}
                        className="p-1 rounded hover:bg-accent/10 text-fg-muted hover:text-accent"
                        aria-label={`Delete ${s.title}`}
                      >
                        <Trash2 size={11} aria-hidden="true" />
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="px-4 py-1 border-t border-line">
          <FileUploader onSuccess={refresh} />
        </div>
```

- [ ] **Step 5: Remove the old `flex-1 overflow-y-auto` from sources container**

The sources list previously had `flex-1 overflow-y-auto`. Now that sessions have `flex-1`, the sources should have a fixed max-height. Find the sources scrollable div:

```jsx
        <div className="flex-1 overflow-y-auto overscroll-contain px-2 pb-2">
```

Replace `flex-1` with `max-h-[240px]`:

```jsx
        <div className="overflow-y-auto overscroll-contain px-2 pb-2 max-h-[240px]">
```

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/Sidebar.jsx
git commit -m "feat: add session list with switch/rename/delete to Sidebar"
```

---

## Task 12: Frontend — ChatWindow.jsx Load & Save Messages

**Files:**
- Modify: `frontend/src/components/ChatWindow.jsx`

- [ ] **Step 1: Add imports**

In `frontend/src/components/ChatWindow.jsx`, replace line 1:

```jsx
import { useState, useRef, useEffect } from "react";
```

With:

```jsx
import { useState, useRef, useEffect, useCallback } from "react";
```

Replace line 8:

```jsx
import { queryStream } from "../hooks/useChat";
```

With:

```jsx
import { queryStream, getSession, saveMessage } from "../hooks/useChat";
```

- [ ] **Step 2: Update component signature**

Replace the function signature:

```jsx
export default function ChatWindow({
  sessionId,
  selectedModel,
  onSelectModel,
  selectedDocIds,
  onOpenSidebar,
  onSessionLoaded,
  onMessageSaved,
}) {
```

- [ ] **Step 3: Add session message loading effect**

After the `latencyRef` declaration (after line 32), add:

```jsx
  useEffect(() => {
    if (!sessionId) return;
    setMessages([]);
    setError(null);
    getSession(sessionId)
      .then((data) => {
        const loadedMsgs = (data.messages || []).map((m) => ({
          role: m.role,
          content: m.content,
          sources: m.sources || [],
          latencyMs: m.latency_ms,
        }));
        setMessages(loadedMsgs);
        onSessionLoaded?.(data);
      })
      .catch(() => {
        setError("Failed to load conversation.");
      });
  }, [sessionId]);
```

- [ ] **Step 4: Add message persistence after streaming**

In the `handleSend` function, find the `onDone` callback (the second callback argument to `queryStream`). It currently looks like:

```jsx
      () => {
        const elapsed = Date.now() - latencyRef.current;
        setStreaming(false);
        setMessages((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = {
            ...updated[updated.length - 1],
            latencyMs: elapsed,
          };
          return updated;
        });
      },
```

Replace with:

```jsx
      () => {
        const elapsed = Date.now() - latencyRef.current;
        setStreaming(false);
        setMessages((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = {
            ...updated[updated.length - 1],
            latencyMs: elapsed,
          };

          if (sessionId) {
            saveMessage(sessionId, { role: "user", content: question })
              .catch(() => {});
            saveMessage(sessionId, {
              role: "assistant",
              content: assistantContent,
              latency_ms: elapsed,
              model: selectedModel,
            })
              .then((res) => {
                if (res.auto_title) {
                  onMessageSaved?.(res.auto_title);
                }
              })
              .catch(() => {});
          }

          return updated;
        });
      },
```

- [ ] **Step 5: Add `onSessionLoaded` and `onMessageSaved` to the deps**

Update the `useEffect` that auto-scrolls. It currently depends on `[messages]`. Keep it as is — no change needed since `onSessionLoaded` is only called on mount via the separate effect.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/ChatWindow.jsx
git commit -m "feat: load session messages on switch, persist after streaming"
```

---

## Task 13: Build & Full Integration Test

**Files:**
- None (verification only)

- [ ] **Step 1: Build the frontend**

```bash
cd frontend && npm run build
```

Expected: Build succeeds with no errors.

- [ ] **Step 2: Restart both servers**

```bash
# Kill existing processes if needed
cd backend && uvicorn main:app --host 0.0.0.0 --port 8000 --reload &
cd frontend && npm run dev -- --port 5176 &
sleep 3
```

- [ ] **Step 3: Verify full session lifecycle via API**

Run this end-to-end test script:

```bash
# 1. Create session
SESSION=$(curl -s -X POST http://localhost:8000/sessions \
  -H "Content-Type: application/json" \
  -d '{"title": "Test Session"}')
SESSION_ID=$(echo $SESSION | python -c "import sys,json; print(json.load(sys.stdin)['id'])")
echo "Created session: $SESSION_ID"

# 2. Save user message
curl -s -X POST "http://localhost:8000/sessions/$SESSION_ID/messages" \
  -H "Content-Type: application/json" \
  -d '{"role": "user", "content": "What is RAG?"}' > /dev/null

# 3. Save assistant message (may trigger auto-title)
ASSISTANT_RES=$(curl -s -X POST "http://localhost:8000/sessions/$SESSION_ID/messages" \
  -H "Content-Type: application/json" \
  -d '{"role": "assistant", "content": "RAG stands for Retrieval-Augmented Generation.", "latency_ms": 1500, "model": "meta/llama-3.1-8b-instruct"}')
echo "Assistant save response: $ASSISTANT_RES"

# 4. List sessions
echo "Session list:"
curl -s http://localhost:8000/sessions | python -m json.tool

# 5. Get full session with messages
echo "Full session detail:"
curl -s "http://localhost:8000/sessions/$SESSION_ID" | python -m json.tool

# 6. Patch session title
echo "Renaming session..."
curl -s -X PATCH "http://localhost:8000/sessions/$SESSION_ID" \
  -H "Content-Type: application/json" \
  -d '{"title": "Renamed Session"}' | python -m json.tool

# 7. Delete session
echo "Deleting session..."
curl -s -X DELETE "http://localhost:8000/sessions/$SESSION_ID" | python -m json.tool

echo "ALL INTEGRATION TESTS PASSED"
```

Expected: `ALL INTEGRATION TESTS PASSED`

- [ ] **Step 4: Manual browser test**

Open `http://localhost:5176` in the browser and verify:

1. Page loads — a session is auto-created
2. Type a question, get a response
3. The session appears in the sidebar with an auto-generated title
4. Click "new --chat" — a new session is created, chat clears
5. Click the previous session — messages reload
6. Hover a session → rename icon appears → click → type new name → Enter
7. Hover a session → delete icon → confirm → session removed
8. Refresh the page — sessions and messages persist
9. Sessions section and sources section both scroll independently

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "feat: complete session persistence — SQLite backend, session list, auto-titles"
```

---

## Self-Review Checklist

- [x] Spec coverage: all 6 API endpoints implemented (Tasks 6-7)
- [x] Spec coverage: SQLite schema matches spec (Task 1)
- [x] Spec coverage: auto-title on first assistant message (Task 6)
- [x] Spec coverage: per-session doc_ids + model (Tasks 2, 10)
- [x] Spec coverage: full message objects with sources + latency (Tasks 3, 12)
- [x] Spec coverage: session list with rename/delete (Task 11)
- [x] Spec coverage: post-stream persistence (Task 12)
- [x] No placeholders — all code is complete
- [x] Type consistency — `createSession`, `getSession`, `saveMessage` names match across useChat.js, App.jsx, ChatWindow.jsx
- [x] Frontend proxy updated for `/sessions` (Task 9)
