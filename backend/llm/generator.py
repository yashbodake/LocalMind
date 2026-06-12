import asyncio
import logging
import os
from collections.abc import AsyncGenerator

import yaml
from openai import OpenAI

from models.schemas import SourceChunk

logger = logging.getLogger(__name__)

_CONFIG_PATH = "config.yaml"

SYSTEM_PROMPT = (
    "You are a helpful assistant answering questions based strictly on the provided context.\n"
    "Always cite which source (Source 1, Source 2, etc.) you used.\n"
    "If the answer is not found in the context, say \"I couldn't find this in your knowledge base.\"\n"
    "Do not make up information."
)

_client: OpenAI | None = None


def _load_config() -> dict:
    with open(_CONFIG_PATH, "r") as f:
        return yaml.safe_load(f)


def _get_client() -> OpenAI:
    global _client
    if _client is None:
        config = _load_config()
        _client = OpenAI(
            base_url=config["llm"]["base_url"],
            api_key=os.getenv("NVIDIA_API_KEY"),
        )
    return _client


def _build_context(chunks: list[SourceChunk]) -> str:
    parts: list[str] = []
    for i, chunk in enumerate(chunks, start=1):
        parts.append(
            f"[Source {i} - {chunk.filename}, chunk {chunk.chunk_index}]\n"
            f"{chunk.content}"
        )
    return "\n\n".join(parts)


def _build_messages(question: str, chunks: list[SourceChunk]) -> list[dict]:
    context = _build_context(chunks)
    return [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": f"Context:\n{context}\n\nUser Question:\n{question}"},
    ]


def generate(question: str, chunks: list[SourceChunk]) -> str:
    client = _get_client()
    config = _load_config()
    llm_cfg = config["llm"]

    if not chunks:
        return "I couldn't find this in your knowledge base."

    messages = _build_messages(question, chunks)

    response = client.chat.completions.create(
        model=llm_cfg["model"],
        messages=messages,
        max_tokens=llm_cfg["max_tokens"],
        temperature=llm_cfg["temperature"],
        stream=False,
    )

    answer = response.choices[0].message.content
    logger.info("Generated answer (%d chars) for question", len(answer))
    return answer


async def stream(question: str, chunks: list[SourceChunk]) -> AsyncGenerator[str, None]:
    client = _get_client()
    config = _load_config()
    llm_cfg = config["llm"]

    if not chunks:
        yield "I couldn't find this in your knowledge base."
        return

    messages = _build_messages(question, chunks)

    loop = asyncio.get_event_loop()

    response = await loop.run_in_executor(
        None,
        lambda: client.chat.completions.create(
            model=llm_cfg["model"],
            messages=messages,
            max_tokens=llm_cfg["max_tokens"],
            temperature=llm_cfg["temperature"],
            stream=True,
        ),
    )

    for chunk in response:
        delta = chunk.choices[0].delta
        if delta.content:
            yield delta.content
