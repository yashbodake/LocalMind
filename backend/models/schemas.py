from datetime import datetime
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


class SourceInfo(BaseModel):
    doc_id: str
    filename: str
    chunks: int
    ingested_at: str
    size_kb: float


class SourcesResponse(BaseModel):
    sources: list[SourceInfo]


class DeleteResponse(BaseModel):
    status: str
    doc_id: str


class SourceChunk(BaseModel):
    doc_id: str
    filename: str
    chunk_index: int
    content: str
    score: float


class QueryRequest(BaseModel):
    question: str
    top_k: int = 5


class QueryResponse(BaseModel):
    answer: str
    sources: list[SourceChunk]
    latency_ms: int


class HealthResponse(BaseModel):
    status: str
    chroma: str
    embed_model: str
    version: str
