from datetime import datetime
from typing import Optional
from pydantic import BaseModel


class Document(BaseModel):
    doc_id: str
    filename: str
    source_path: str
    chunks: int
    ingested_at: datetime
    size_kb: float


class IngestedFile(BaseModel):
    filename: str
    chunks: int
    doc_id: str


class IngestResponse(BaseModel):
    status: str
    ingested: list[IngestedFile]
    errors: list = []


class IngestError(BaseModel):
    filename: str
    error: str


class URLIngestRequest(BaseModel):
    url: str
    title: Optional[str] = None


class SourceInfo(BaseModel):
    doc_id: str
    filename: str
    chunks: int
    ingested_at: str
    size_kb: float = 0.0
    file_type: str = "unknown"
    word_count: int = 0


class SourcesResponse(BaseModel):
    sources: list[SourceInfo]


class TextIngestRequest(BaseModel):
    text: str
    title: str | None = None


class DeleteResponse(BaseModel):
    status: str
    doc_id: str


class SourceChunk(BaseModel):
    doc_id: str
    filename: str
    chunk_index: int
    content: str
    score: float


class HistoryMessage(BaseModel):
    role: str
    content: str


class QueryRequest(BaseModel):
    question: str
    top_k: int = 5
    history: list[HistoryMessage] = []
    model: Optional[str] = None
    doc_ids: Optional[list[str]] = None


class QueryResponse(BaseModel):
    answer: str
    sources: list[SourceChunk]
    latency_ms: int


class HealthResponse(BaseModel):
    status: str
    chroma: str
    embed_model: str
    version: str


class ModelsResponse(BaseModel):
    models: list[str]
    default: str
