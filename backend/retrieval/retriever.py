import logging

import yaml

from ingest.embedder import _get_model, _get_collection
from models.schemas import SourceChunk

logger = logging.getLogger(__name__)

_CONFIG_PATH = "config.yaml"


def _load_config() -> dict:
    with open(_CONFIG_PATH, "r") as f:
        return yaml.safe_load(f)


def retrieve(question: str, top_k: int | None = None) -> list[SourceChunk]:
    config = _load_config()
    retrieval_cfg = config["retrieval"]

    if top_k is None:
        top_k = retrieval_cfg["top_k"]

    threshold = retrieval_cfg["similarity_threshold"]

    model = _get_model()
    collection = _get_collection()

    query_embedding = model.encode([question], normalize_embeddings=True).tolist()

    results = collection.query(
        query_embeddings=query_embedding,
        n_results=top_k,
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

    logger.info("Retrieved %d chunks above threshold %.2f for query", len(chunks), threshold)
    return chunks
