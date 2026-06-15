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

        CREATE TABLE IF NOT EXISTS documents (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            doc_id TEXT UNIQUE NOT NULL,
            filename TEXT NOT NULL,
            file_type TEXT NOT NULL,
            size_kb REAL DEFAULT 0.0,
            word_count INTEGER DEFAULT 0,
            chunk_count INTEGER DEFAULT 0,
            file_hash TEXT,
            content TEXT,
            ingested_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
        """
    )
    conn.commit()
    try:
        conn.execute("ALTER TABLE messages ADD COLUMN followups TEXT DEFAULT NULL")
    except sqlite3.OperationalError:
        pass
    try:
        conn.execute("ALTER TABLE sessions ADD COLUMN pinned INTEGER DEFAULT 0")
    except sqlite3.OperationalError:
        pass
    try:
        conn.execute("ALTER TABLE messages ADD COLUMN feedback TEXT DEFAULT NULL")
    except sqlite3.OperationalError:
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
        """SELECT s.id, s.title, s.updated_at, s.pinned,
                  (SELECT COUNT(*) FROM messages m WHERE m.session_id = s.id) as message_count
           FROM sessions s
           ORDER BY s.pinned DESC, s.updated_at DESC"""
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
    pinned: int | None = None,
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
    new_pinned = pinned if pinned is not None else existing.get("pinned", 0)
    now = _now()

    conn.execute(
        """UPDATE sessions SET title = ?, model = ?, doc_ids = ?, pinned = ?, updated_at = ?
           WHERE id = ?""",
        (new_title, new_model, new_doc_ids, new_pinned, now, session_id),
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


def update_message_feedback(message_id: str, feedback: str | None) -> bool:
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute(
        "UPDATE messages SET feedback = ? WHERE id = ?",
        (feedback, message_id),
    )
    conn.commit()
    return cursor.rowcount > 0


def truncate_messages(session_id: str, from_index: int) -> int:
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute(
        "SELECT id FROM messages WHERE session_id = ? ORDER BY created_at ASC",
        (session_id,)
    )
    ids = [row["id"] for row in cursor.fetchall()]
    if from_index >= len(ids):
        return 0
    ids_to_delete = ids[from_index:]
    placeholders = ",".join("?" * len(ids_to_delete))
    cursor.execute(
        f"DELETE FROM messages WHERE id IN ({placeholders})",
        ids_to_delete
    )
    deleted = cursor.rowcount
    cursor.execute(
        "UPDATE sessions SET updated_at = ? WHERE id = ?",
        (_now(), session_id)
    )
    conn.commit()
    return deleted


def save_document(doc_id, filename, file_type, size_kb, word_count, chunk_count, file_hash, content):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute(
        """INSERT INTO documents (doc_id, filename, file_type, size_kb, word_count, chunk_count, file_hash, content, ingested_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (doc_id, filename, file_type, size_kb, word_count, chunk_count, file_hash, content, _now())
    )
    conn.commit()
    return cursor.lastrowid


def get_document(doc_id):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM documents WHERE doc_id = ?", (doc_id,))
    row = cursor.fetchone()
    if not row:
        return None
    return dict(row)


def get_document_by_hash(file_hash):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM documents WHERE file_hash = ?", (file_hash,))
    row = cursor.fetchone()
    return dict(row) if row else None


def list_documents():
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM documents ORDER BY ingested_at DESC")
    return [dict(row) for row in cursor.fetchall()]


def delete_document(doc_id):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM documents WHERE doc_id = ?", (doc_id,))
    conn.commit()
    return cursor.rowcount > 0


def delete_documents_bulk(doc_ids):
    if not doc_ids:
        return 0
    conn = get_db()
    cursor = conn.cursor()
    placeholders = ",".join("?" * len(doc_ids))
    cursor.execute(f"DELETE FROM documents WHERE doc_id IN ({placeholders})", doc_ids)
    conn.commit()
    return cursor.rowcount


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
