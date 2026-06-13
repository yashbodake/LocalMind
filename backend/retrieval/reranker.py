import logging

import yaml
from sentence_transformers import CrossEncoder

from models.schemas import SourceChunk

logger = logging.getLogger(__name__)

_CONFIG_PATH = "config.yaml"

_reranker: CrossEncoder | None = None


def _load_config() -> dict:
    with open(_CONFIG_PATH, "r") as f:
        return yaml.safe_load(f)


def _get_reranker() -> CrossEncoder:
    global _reranker
    if _reranker is None:
        config = _load_config()
        model_name = config["retrieval"]["reranker"]["model"]
        logger.info("Loading reranker model: %s", model_name)
        _reranker = CrossEncoder(model_name)
    return _reranker


def rerank(
    question: str, chunks: list[SourceChunk], final_k: int
) -> list[SourceChunk]:
    if not chunks:
        return chunks

    model = _get_reranker()

    pairs = [[question, chunk.content] for chunk in chunks]
    scores = model.predict(pairs).tolist()

    scored = list(zip(scores, chunks))
    scored.sort(key=lambda x: x[0], reverse=True)

    reranked = [chunk for _, chunk in scored[:final_k]]

    logger.info(
        "Reranked %d chunks down to %d for query", len(chunks), len(reranked)
    )
    return reranked
