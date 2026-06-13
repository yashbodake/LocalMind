from typing import Literal, Optional
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
    role: Literal["user", "assistant"]
    content: str
    sources: Optional[list[dict]] = None
    latency_ms: Optional[int] = None
    model: Optional[str] = None
