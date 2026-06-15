import logging
from datetime import datetime, timezone

from typing import Optional

import chromadb
import yaml
from sentence_transformers import SentenceTransformer

from database import get_setting

logger = logging.getLogger(__name__)

_CONFIG_PATH = "config.yaml"

_model: Optional[SentenceTransformer] = None
_client: Optional[chromadb.ClientAPI] = None
_collection = None


def _load_config() -> dict:
    with open(_CONFIG_PATH, "r") as f:
        return yaml.safe_load(f)


def _get_model() -> SentenceTransformer:
    global _model
    if _model is None:
        config = _load_config()
        model_name = get_setting("embedding.model") or config["embedding"]["model"]
        _model = SentenceTransformer(
            model_name,
            device=config["embedding"]["device"],
        )
        logger.info("Loaded embedding model: %s", model_name)
    return _model


def reset_model() -> None:
    global _model
    _model = None
    logger.info("Embedding model reset — will reload on next use")


def recreate_collection() -> None:
    global _client, _collection
    config = _load_config()
    _client = chromadb.PersistentClient(path=config["chroma"]["path"])
    try:
        _client.delete_collection(name=config["chroma"]["collection"])
        logger.info("Deleted existing collection for recreation")
    except Exception:
        pass
    _collection = _client.get_or_create_collection(
        name=config["chroma"]["collection"],
        metadata={"hnsw:space": config["chroma"]["distance"]},
    )
    logger.info("Recreated collection: %s", config["chroma"]["collection"])


def _get_collection():
    global _client, _collection
    if _collection is None:
        config = _load_config()
        _client = chromadb.PersistentClient(path=config["chroma"]["path"])
        _collection = _client.get_or_create_collection(
            name=config["chroma"]["collection"],
            metadata={"hnsw:space": config["chroma"]["distance"]},
        )
    return _collection


def embed_and_store(
    chunks: list[str],
    metadata: dict,
) -> int:
    model = _get_model()
    collection = _get_collection()

    embeddings = model.encode(chunks, normalize_embeddings=True).tolist()

    doc_id = metadata["doc_id"]
    filename = metadata["filename"]
    source_path = metadata["source_path"]
    ingested_at = metadata.get("ingested_at", datetime.now(timezone.utc).isoformat())

    ids = [f"{doc_id}_chunk_{i}" for i in range(len(chunks))]
    metadatas = [
        {
            "doc_id": doc_id,
            "filename": filename,
            "source_path": source_path,
            "chunk_index": i,
            "ingested_at": ingested_at,
        }
        for i in range(len(chunks))
    ]

    collection.upsert(
        ids=ids,
        embeddings=embeddings,
        documents=chunks,
        metadatas=metadatas,
    )

    logger.info("Upserted %d chunks for doc %s (%s)", len(chunks), doc_id, filename)
    return len(chunks)


def get_collection():
    return _get_collection()


def delete_doc(doc_id: str) -> None:
    collection = _get_collection()
    results = collection.get(where={"doc_id": doc_id})
    if results["ids"]:
        collection.delete(ids=results["ids"])
        logger.info("Deleted %d chunks for doc %s", len(results["ids"]), doc_id)
    else:
        logger.warning("No chunks found for doc %s", doc_id)


def list_sources() -> list[dict]:
    collection = _get_collection()
    results = collection.get(include=["metadatas"])

    seen: dict[str, dict] = {}
    for meta in results["metadatas"]:
        did = meta["doc_id"]
        if did not in seen:
            seen[did] = {
                "doc_id": did,
                "filename": meta["filename"],
                "chunks": 0,
                "ingested_at": meta.get("ingested_at", ""),
                "size_kb": 0.0,
            }
        seen[did]["chunks"] += 1

    return list(seen.values())
