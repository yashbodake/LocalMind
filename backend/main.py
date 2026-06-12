import _sqlite_patch  # noqa: F401

import logging
import os
import tempfile
import uuid
from datetime import datetime, timezone
from pathlib import Path

import yaml
from dotenv import load_dotenv
from fastapi import FastAPI, File, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

from ingest.chunker import chunk_text
from ingest.embedder import delete_doc, embed_and_store, list_sources
from ingest.loader import load_file
from llm.generator import generate, stream
from models.schemas import (
    DeleteResponse,
    HealthResponse,
    IngestedFile,
    IngestResponse,
    QueryRequest,
    QueryResponse,
    SourceInfo,
    SourcesResponse,
)
from retrieval.retriever import retrieve

load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

_CONFIG_PATH = "config.yaml"


def _load_config() -> dict:
    config_path = Path(_CONFIG_PATH)
    if not config_path.exists():
        config_path = Path(__file__).parent / _CONFIG_PATH
    with open(config_path, "r") as f:
        return yaml.safe_load(f)


config = _load_config()

app = FastAPI(title="LocalMind", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=config["server"]["cors_origins"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health", response_model=HealthResponse)
async def health():
    chroma_status = "connected"
    try:
        from ingest.embedder import get_collection

        get_collection()
    except Exception:
        chroma_status = "error"

    return HealthResponse(
        status="ok",
        chroma=chroma_status,
        embed_model=config["embedding"]["model"],
        version="1.0.0",
    )


@app.post("/ingest", response_model=IngestResponse)
async def ingest_files(files: list[UploadFile] = File(...)):
    allowed = config["ingest"]["allowed_extensions"]
    ingested: list[IngestedFile] = []

    for uploaded in files:
        ext = Path(uploaded.filename).suffix.lower()
        if ext not in allowed:
            raise HTTPException(
                status_code=422,
                detail=f"Only {', '.join(allowed)} supported. Got '{ext}' in '{uploaded.filename}'.",
            )

        with tempfile.NamedTemporaryFile(delete=False, suffix=ext) as tmp:
            content = await uploaded.read()
            if not content:
                raise HTTPException(
                    status_code=400,
                    detail=f"File is empty: {uploaded.filename}",
                )
            tmp.write(content)
            tmp_path = tmp.name

        try:
            text = load_file(tmp_path)
            chunks = chunk_text(text)

            doc_id = uuid.uuid4().hex[:12]
            size_kb = round(len(content) / 1024, 2)
            ingested_at = datetime.now(timezone.utc).isoformat()

            embed_and_store(
                chunks,
                {
                    "doc_id": doc_id,
                    "filename": uploaded.filename,
                    "source_path": uploaded.filename,
                    "ingested_at": ingested_at,
                },
            )

            ingested.append(
                IngestedFile(
                    filename=uploaded.filename,
                    chunks=len(chunks),
                    doc_id=doc_id,
                )
            )
        except ValueError as e:
            raise HTTPException(status_code=422, detail=str(e))
        except Exception as e:
            logger.exception("Ingest failed for %s", uploaded.filename)
            raise HTTPException(status_code=500, detail=f"Processing failed: {str(e)}")
        finally:
            os.unlink(tmp_path)

    return IngestResponse(status="success", ingested=ingested)


@app.get("/sources", response_model=SourcesResponse)
async def get_sources():
    sources = list_sources()
    return SourcesResponse(
        sources=[SourceInfo(**s) for s in sources]
    )


@app.delete("/sources/{doc_id}", response_model=DeleteResponse)
async def remove_source(doc_id: str):
    try:
        delete_doc(doc_id)
    except Exception as e:
        logger.exception("Delete failed for %s", doc_id)
        raise HTTPException(status_code=500, detail=f"Vector store error: {str(e)}")

    return DeleteResponse(status="deleted", doc_id=doc_id)


@app.post("/query", response_model=QueryResponse)
async def query_knowledge_base(request: QueryRequest):
    import time

    start = time.time()

    try:
        chunks = retrieve(request.question, top_k=request.top_k)
    except Exception as e:
        logger.exception("Retrieval failed")
        raise HTTPException(status_code=500, detail=f"Vector store error: {str(e)}")

    try:
        answer = generate(request.question, chunks)
    except Exception as e:
        logger.exception("LLM call failed")
        raise HTTPException(status_code=502, detail="LLM service unavailable")

    latency_ms = int((time.time() - start) * 1000)

    return QueryResponse(
        answer=answer,
        sources=chunks,
        latency_ms=latency_ms,
    )


@app.get("/query/stream")
async def query_stream(q: str = Query(...), top_k: int = Query(default=5)):
    try:
        chunks = retrieve(q, top_k=top_k)
    except Exception as e:
        logger.exception("Retrieval failed for stream")
        raise HTTPException(status_code=500, detail=f"Vector store error: {str(e)}")

    async def stream_generator():
        async for token in stream(q, chunks):
            yield f"data: {token}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(stream_generator(), media_type="text/event-stream")
