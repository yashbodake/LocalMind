import _sqlite_patch  # noqa: F401

import hashlib
import logging
import os
import tempfile
import uuid
from datetime import datetime, timezone
from pathlib import Path

import yaml
from dotenv import load_dotenv
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

from database import (
    delete_document,
    delete_documents_bulk,
    get_document,
    get_document_by_hash,
    get_setting,
    init_db,
    list_documents,
    save_document,
)
from routes.sessions import router as sessions_router
from routes.settings import router as settings_router
from ingest.chunker import chunk_text
from ingest.embedder import delete_doc, embed_and_store, list_sources
from ingest.loader import load_file
from llm.generator import generate, stream
from models.schemas import (
    DeleteResponse,
    HealthResponse,
    IngestedFile,
    IngestResponse,
    IngestError,
    ModelsResponse,
    QueryRequest,
    QueryResponse,
    SourceInfo,
    SourcesResponse,
    TextIngestRequest,
    URLIngestRequest,
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

init_db()
app.include_router(sessions_router)
app.include_router(settings_router)


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


@app.get("/models", response_model=ModelsResponse)
async def get_models():
    llm_cfg = config["llm"]
    return ModelsResponse(
        models=llm_cfg.get("models", [llm_cfg["model"]]),
        default=llm_cfg["model"],
    )


@app.post("/ingest", response_model=IngestResponse)
async def ingest_files(files: list[UploadFile] = File(...)):
    allowed = config["ingest"]["allowed_extensions"]
    ingested: list[IngestedFile] = []
    errors: list[IngestError] = []

    for uploaded in files:
        ext = Path(uploaded.filename).suffix.lower()
        if ext not in allowed:
            errors.append(IngestError(
                filename=uploaded.filename,
                error=f"Unsupported type '{ext}'. Only {', '.join(allowed)} supported.",
            ))
            continue

        try:
            with tempfile.NamedTemporaryFile(delete=False, suffix=ext) as tmp:
                content = await uploaded.read()
                if not content:
                    errors.append(IngestError(filename=uploaded.filename, error="File is empty"))
                    continue
                tmp.write(content)
                tmp_path = tmp.name

            try:
                text = load_file(tmp_path)

                file_hash = hashlib.sha256(text.encode()).hexdigest()
                existing_doc = get_document_by_hash(file_hash)
                if existing_doc:
                    ingested.append(IngestedFile(
                        filename=uploaded.filename,
                        chunks=existing_doc["chunk_count"],
                        doc_id=existing_doc["doc_id"],
                    ))
                    continue

                user_cs = get_setting("chunking.chunk_size")
                user_co = get_setting("chunking.chunk_overlap")
                try:
                    cs = int(user_cs) if user_cs else None
                except (ValueError, TypeError):
                    cs = None
                try:
                    co = int(user_co) if user_co else None
                except (ValueError, TypeError):
                    co = None
                chunks = chunk_text(text, chunk_size=cs, chunk_overlap=co)

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

                word_count = len(text.split())
                file_type = uploaded.filename.rsplit(".", 1)[-1].lower() if "." in uploaded.filename else "unknown"
                save_document(
                    doc_id=doc_id,
                    filename=uploaded.filename,
                    file_type=file_type,
                    size_kb=size_kb,
                    word_count=word_count,
                    chunk_count=len(chunks),
                    file_hash=file_hash,
                    content=text,
                )

                ingested.append(
                    IngestedFile(
                        filename=uploaded.filename,
                        chunks=len(chunks),
                        doc_id=doc_id,
                    )
                )
            finally:
                os.unlink(tmp_path)
        except ValueError as e:
            errors.append(IngestError(filename=uploaded.filename, error=str(e)))
        except Exception as e:
            logger.exception("Ingest failed for %s", uploaded.filename)
            errors.append(IngestError(filename=uploaded.filename, error=f"Processing failed: {str(e)}"))

    status = "success" if not errors else ("partial" if ingested else "error")
    return IngestResponse(status=status, ingested=ingested, errors=errors)


@app.post("/ingest/text")
async def ingest_text(payload: TextIngestRequest):
    text = payload.text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="Text cannot be empty")

    title = payload.title or "Pasted Note"
    file_hash = hashlib.sha256(text.encode()).hexdigest()
    existing = get_document_by_hash(file_hash)
    if existing:
        return IngestResponse(
            status="duplicate",
            ingested=[IngestedFile(filename=existing["filename"], chunks=existing["chunk_count"], doc_id=existing["doc_id"])]
        )

    doc_id = uuid.uuid4().hex[:12]
    file_type = "text"
    size_kb = len(text.encode()) / 1024
    word_count = len(text.split())

    user_cs = get_setting("chunking.chunk_size")
    user_co = get_setting("chunking.chunk_overlap")
    try:
        cs = int(user_cs) if user_cs else None
    except (ValueError, TypeError):
        cs = None
    try:
        co = int(user_co) if user_co else None
    except (ValueError, TypeError):
        co = None
    chunks = chunk_text(text, chunk_size=cs, chunk_overlap=co)
    metadata = {"doc_id": doc_id, "filename": title, "source_path": title}
    embed_and_store(chunks, metadata)

    save_document(
        doc_id=doc_id, filename=title, file_type=file_type,
        size_kb=size_kb, word_count=word_count, chunk_count=len(chunks),
        file_hash=file_hash, content=text,
    )

    return IngestResponse(
        status="success",
        ingested=[IngestedFile(filename=title, chunks=len(chunks), doc_id=doc_id)]
    )


@app.post("/ingest/url")
async def ingest_url(payload: URLIngestRequest):
    import httpx
    from bs4 import BeautifulSoup
    import re

    url = payload.url.strip()
    if not url.startswith(("http://", "https://")):
        raise HTTPException(status_code=422, detail="URL must start with http:// or https://")

    try:
        async with httpx.AsyncClient(timeout=15, follow_redirects=True) as client:
            resp = await client.get(url, headers={"User-Agent": "LocalMind/1.0"})
            resp.raise_for_status()
    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="URL fetch timed out (15s)")
    except httpx.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"Failed to fetch URL: {str(e)}")

    soup = BeautifulSoup(resp.text, "html.parser")
    for tag in soup(["script", "style", "nav", "footer", "header", "aside"]):
        tag.decompose()

    page_title = payload.title or (soup.title.string.strip() if soup.title and soup.title.string else url)
    body = soup.find("body") or soup
    text = body.get_text(separator="\n", strip=True)
    text = re.sub(r"\n{3,}", "\n\n", text)

    if not text.strip():
        raise HTTPException(status_code=422, detail="No text content found at URL")

    file_hash = hashlib.sha256(text.encode()).hexdigest()
    existing = get_document_by_hash(file_hash)
    if existing:
        return IngestResponse(
            status="duplicate",
            ingested=[IngestedFile(filename=existing["filename"], chunks=existing["chunk_count"], doc_id=existing["doc_id"])]
        )

    user_cs = get_setting("chunking.chunk_size")
    user_co = get_setting("chunking.chunk_overlap")
    try:
        cs = int(user_cs) if user_cs else None
    except (ValueError, TypeError):
        cs = None
    try:
        co = int(user_co) if user_co else None
    except (ValueError, TypeError):
        co = None
    chunks = chunk_text(text, chunk_size=cs, chunk_overlap=co)

    doc_id = uuid.uuid4().hex[:12]
    size_kb = len(text.encode()) / 1024
    word_count = len(text.split())

    embed_and_store(chunks, {"doc_id": doc_id, "filename": page_title, "source_path": url})

    save_document(
        doc_id=doc_id, filename=page_title, file_type="web",
        size_kb=size_kb, word_count=word_count, chunk_count=len(chunks),
        file_hash=file_hash, content=text,
    )

    return IngestResponse(
        status="success",
        ingested=[IngestedFile(filename=page_title, chunks=len(chunks), doc_id=doc_id)]
    )


@app.post("/sources/{doc_id}/reingest")
async def reingest_document(doc_id: str):
    doc = get_document(doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    text = doc.get("content", "")
    if not text.strip():
        raise HTTPException(status_code=422, detail="No content to re-ingest")

    delete_doc(doc_id)

    user_cs = get_setting("chunking.chunk_size")
    user_co = get_setting("chunking.chunk_overlap")
    try:
        cs = int(user_cs) if user_cs else None
    except (ValueError, TypeError):
        cs = None
    try:
        co = int(user_co) if user_co else None
    except (ValueError, TypeError):
        co = None
    chunks = chunk_text(text, chunk_size=cs, chunk_overlap=co)

    file_hash = hashlib.sha256(text.encode()).hexdigest()

    embed_and_store(
        chunks,
        {
            "doc_id": doc_id,
            "filename": doc["filename"],
            "source_path": doc.get("filename", ""),
            "ingested_at": datetime.now(timezone.utc).isoformat(),
        },
    )

    from database import get_db
    conn = get_db()
    conn.execute(
        """UPDATE documents SET chunk_count = ?, file_hash = ?, ingested_at = ?
           WHERE doc_id = ?""",
        (len(chunks), file_hash, datetime.now(timezone.utc).isoformat(), doc_id),
    )
    conn.commit()

    return {
        "status": "ok",
        "doc_id": doc_id,
        "filename": doc["filename"],
        "chunk_count": len(chunks),
    }


@app.get("/sources", response_model=SourcesResponse)
async def get_sources():
    docs = list_documents()
    return SourcesResponse(
        sources=[
            SourceInfo(
                doc_id=d["doc_id"],
                filename=d["filename"],
                chunks=d["chunk_count"],
                ingested_at=d["ingested_at"],
                size_kb=d["size_kb"],
                file_type=d["file_type"],
                word_count=d["word_count"],
            )
            for d in docs
        ]
    )


@app.delete("/sources/bulk")
async def remove_sources_bulk(doc_ids: list[str]):
    for doc_id in doc_ids:
        try:
            delete_doc(doc_id)
        except Exception as e:
            logger.warning("Failed to delete %s from ChromaDB: %s", doc_id, e)
    deleted = delete_documents_bulk(doc_ids)
    return {"status": "ok", "deleted_count": deleted}


@app.delete("/sources/{doc_id}", response_model=DeleteResponse)
async def remove_source(doc_id: str):
    try:
        delete_doc(doc_id)
    except Exception as e:
        logger.exception("Delete failed for %s", doc_id)
        raise HTTPException(status_code=500, detail=f"Vector store error: {str(e)}")

    delete_document(doc_id)
    return DeleteResponse(status="deleted", doc_id=doc_id)


@app.get("/sources/{doc_id}/content")
async def get_source_content(doc_id: str):
    doc = get_document(doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    return {
        "doc_id": doc["doc_id"],
        "filename": doc["filename"],
        "content": doc["content"],
        "file_type": doc["file_type"],
        "size_kb": doc["size_kb"],
        "word_count": doc["word_count"],
        "chunk_count": doc["chunk_count"],
        "ingested_at": doc["ingested_at"],
    }


@app.post("/query", response_model=QueryResponse)
async def query_knowledge_base(request: QueryRequest):
    import time

    start = time.time()

    try:
        chunks = retrieve(
            request.question,
            top_k=request.top_k,
            doc_ids=request.doc_ids,
        )
    except Exception as e:
        logger.exception("Retrieval failed")
        raise HTTPException(status_code=500, detail=f"Vector store error: {str(e)}")

    try:
        answer = generate(
            request.question,
            chunks,
            history=request.history,
            model=request.model,
        )
    except Exception as e:
        logger.exception("LLM call failed")
        raise HTTPException(status_code=502, detail="LLM service unavailable")

    latency_ms = int((time.time() - start) * 1000)

    return QueryResponse(
        answer=answer,
        sources=chunks,
        latency_ms=latency_ms,
    )


@app.post("/query/stream")
async def query_stream(request: QueryRequest):
    try:
        chunks = retrieve(
            request.question,
            top_k=request.top_k,
            doc_ids=request.doc_ids,
        )
    except Exception as e:
        logger.exception("Retrieval failed for stream")
        raise HTTPException(status_code=500, detail=f"Vector store error: {str(e)}")

    async def stream_generator():
        try:
            async for token in stream(
                request.question, chunks, history=request.history, model=request.model
            ):
                yield f"data: {token}\n\n"
        except Exception:
            logger.exception("Stream interrupted")
        yield "data: [DONE]\n\n"

    return StreamingResponse(stream_generator(), media_type="text/event-stream")
