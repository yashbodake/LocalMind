import asyncio
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
    update_message_followups as db_update_message_followups,
    truncate_messages as db_truncate_messages,
)
from models.session_schemas import SessionCreate, SessionUpdate, MessageCreate
from llm.title_generator import generate_title
from llm.followup_generator import generate_followups

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


@router.delete("/{session_id}/messages")
async def truncate_session_messages(session_id: str, from_index: int = 0):
    deleted = db_truncate_messages(session_id, from_index)
    return {"status": "ok", "deleted_count": deleted}


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
    followups = None

    if payload.role == "assistant":
        session = db_get_session(session_id)

        last_user_msg = next(
            (m for m in reversed(session["messages"]) if m["role"] == "user"), None
        )

        user_msgs = [m for m in session["messages"] if m["role"] == "user"]
        asst_msgs = [m for m in session["messages"] if m["role"] == "assistant"]
        needs_title = session and session["title"] == "New Chat" and len(user_msgs) == 1 and len(asst_msgs) == 1

        tasks = []
        task_keys = []

        if last_user_msg:
            tasks.append(asyncio.to_thread(
                generate_followups,
                last_user_msg["content"],
                payload.content,
                payload.model,
            ))
            task_keys.append("followups")

        if needs_title:
            tasks.append(asyncio.to_thread(
                generate_title,
                user_msgs[0]["content"],
                payload.content,
                payload.model,
            ))
            task_keys.append("title")

        if tasks:
            results = await asyncio.gather(*tasks)
            for key, value in zip(task_keys, results):
                if key == "followups" and value:
                    followups = value
                elif key == "title" and value:
                    db_update_session(session_id, title=value)
                    auto_title = value

    if followups:
        db_update_message_followups(result["id"], followups)
        result["followups"] = followups

    if auto_title:
        result["auto_title"] = auto_title

    return result
