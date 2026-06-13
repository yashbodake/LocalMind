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
            followups   TEXT DEFAULT NULL,
            FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_messages_session_id
            ON messages(session_id);
        """
    )
    conn.commit()
    try:
        conn.execute("ALTER TABLE messages ADD COLUMN followups TEXT DEFAULT NULL")
    except Exception:
        pass
    logger.info("Database schema initialized")


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _gen_id() -> str:
    return uuid.uuid4().hex[:12]


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
        msg["followups"] = json.loads(msg["followups"]) if msg.get("followups") else None
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


def update_message_followups(message_id: str, followups: list[str]) -> bool:
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute(
        "UPDATE messages SET followups = ? WHERE id = ?",
        (json.dumps(followups), message_id),
    )
    conn.commit()
    return cursor.rowcount > 0
