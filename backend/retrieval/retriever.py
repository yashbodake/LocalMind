import logging
from typing import Optional

import yaml

from ingest.embedder import _get_model, _get_collection
from models.schemas import SourceChunk
from retrieval.reranker import rerank
from database import get_setting

logger = logging.getLogger(__name__)

_CONFIG_PATH = "config.yaml"


def _load_config() -> dict:
    with open(_CONFIG_PATH, "r") as f:
        return yaml.safe_load(f)


def retrieve(
    question: str,
    top_k: Optional[int] = None,
    doc_ids: Optional[list[str]] = None,
) -> list[SourceChunk]:
    config = _load_config()
    retrieval_cfg = config["retrieval"]

    user_top_k = get_setting("retrieval.top_k")
    user_threshold = get_setting("retrieval.similarity_threshold")

    if top_k is None:
        try:
            top_k = int(user_top_k) if user_top_k else retrieval_cfg["top_k"]
        except (ValueError, TypeError):
            top_k = retrieval_cfg["top_k"]

    try:
        threshold = float(user_threshold) if user_threshold else retrieval_cfg["similarity_threshold"]
    except (ValueError, TypeError):
        threshold = retrieval_cfg["similarity_threshold"]

    reranker_cfg = retrieval_cfg.get("reranker", {})
    reranker_enabled = reranker_cfg.get("enabled", False)

    if reranker_enabled:
        fetch_k = reranker_cfg["retrieve_k"]
        final_k = reranker_cfg["final_k"]
    else:
        fetch_k = top_k
        final_k = top_k

    model = _get_model()
    collection = _get_collection()

    query_embedding = model.encode([question], normalize_embeddings=True).tolist()

    where_filter = None
    if doc_ids:
        where_filter = {"doc_id": {"$in": doc_ids}}

    results = collection.query(
        query_embeddings=query_embedding,
        n_results=fetch_k,
        where=where_filter,
        include=["documents", "metadatas", "distances"],
    )

    if not results["ids"][0]:
        return []

    chunks: list[SourceChunk] = []
    for i, doc_id in enumerate(results["ids"][0]):
        score = results["distances"][0][i]
        similarity = 1.0 - score

        if similarity < threshold:
            continue

        meta = results["metadatas"][0][i]
        chunks.append(
            SourceChunk(
                doc_id=meta["doc_id"],
                filename=meta["filename"],
                chunk_index=meta["chunk_index"],
                content=results["documents"][0][i],
                score=round(similarity, 4),
            )
        )

    if reranker_enabled and len(chunks) > final_k:
        chunks = rerank(question, chunks, final_k)
    elif chunks:
        chunks = chunks[:final_k]

    logger.info(
        "Retrieved %d chunks for query (reranker=%s)",
        len(chunks),
        reranker_enabled,
    )
    return chunks
