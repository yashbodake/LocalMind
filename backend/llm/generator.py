import asyncio
import logging
from collections.abc import AsyncGenerator

from models.schemas import SourceChunk, HistoryMessage
from llm.client import get_client, load_config
from database import get_setting

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = (
    "You are a helpful assistant answering questions based strictly on the provided context.\n\n"
    "Format your response using markdown:\n"
    "- Start with a **Brief Answer** (1-2 sentences)\n"
    "- Use ## headings for distinct topics\n"
    "- Use bullet points for lists and steps\n"
    "- Use **bold** for key terms and important concepts\n"
    "- Use tables for comparisons or structured data\n"
    "- Use `inline code` for technical terms and ```code blocks``` for code\n"
    "- Use $...$ for inline math and $$...$$ for block math\n"
    "- Cite sources inline as [1], [2], etc.\n\n"
    "If the answer is not found in the context, say \"I couldn't find this in your knowledge base.\"\n"
    "Do not make up information."
)


def _build_context(chunks: list[SourceChunk]) -> str:
    parts: list[str] = []
    for i, chunk in enumerate(chunks, start=1):
        parts.append(
            f"[Source {i} - {chunk.filename}, chunk {chunk.chunk_index}]\n"
            f"{chunk.content}"
        )
    return "\n\n".join(parts)


def _get_effective_llm_params(model: str | None = None) -> tuple[float, int, str]:
    config = load_config()
    llm_cfg = config["llm"]
    use_model = model or llm_cfg["model"]

    temp_str = get_setting("llm.temperature")
    max_tokens_str = get_setting("llm.max_tokens")

    try:
        temperature = float(temp_str) if temp_str else llm_cfg["temperature"]
    except (ValueError, TypeError):
        temperature = llm_cfg["temperature"]

    try:
        max_tokens = int(max_tokens_str) if max_tokens_str else llm_cfg["max_tokens"]
    except (ValueError, TypeError):
        max_tokens = llm_cfg["max_tokens"]

    return temperature, max_tokens, use_model


def _get_effective_system_prompt() -> str:
    override = get_setting("llm.system_prompt")
    return override.strip() if override and override.strip() else SYSTEM_PROMPT


def _build_messages(
    question: str,
    chunks: list[SourceChunk],
    history: list[HistoryMessage] | None = None,
) -> list[dict]:
    context = _build_context(chunks)

    messages: list[dict] = [
        {"role": "system", "content": _get_effective_system_prompt()},
    ]

    if history:
        history_text = "\n".join(
            f"{('User' if h.role == 'user' else 'Assistant')}: {h.content}"
            for h in history
        )
        messages.append(
            {
                "role": "user",
                "content": f"Previous conversation:\n{history_text}\n\nContext:\n{context}\n\nUser Question:\n{question}",
            }
        )
    else:
        messages.append(
            {
                "role": "user",
                "content": f"Context:\n{context}\n\nUser Question:\n{question}",
            }
        )

    return messages


def generate(
    question: str,
    chunks: list[SourceChunk],
    history: list[HistoryMessage] | None = None,
    model: str | None = None,
) -> str:
    client = get_client()

    if not chunks:
        return "I couldn't find this in your knowledge base."

    messages = _build_messages(question, chunks, history)
    temperature, max_tokens, use_model = _get_effective_llm_params(model)

    response = client.chat.completions.create(
        model=use_model,
        messages=messages,
        max_tokens=max_tokens,
        temperature=temperature,
        stream=False,
    )

    answer = response.choices[0].message.content
    logger.info("Generated answer (%d chars) for question using %s", len(answer), use_model)
    return answer


async def stream(
    question: str,
    chunks: list[SourceChunk],
    history: list[HistoryMessage] | None = None,
    model: str | None = None,
) -> AsyncGenerator[str, None]:
    client = get_client()

    if not chunks:
        yield "I couldn't find this in your knowledge base."
        return

    messages = _build_messages(question, chunks, history)
    temperature, max_tokens, use_model = _get_effective_llm_params(model)

    loop = asyncio.get_event_loop()

    response = await loop.run_in_executor(
        None,
        lambda: client.chat.completions.create(
            model=use_model,
            messages=messages,
            max_tokens=max_tokens,
            temperature=temperature,
            stream=True,
        ),
    )

    for chunk in response:
        if not chunk.choices:
            continue
        delta = chunk.choices[0].delta
        if delta.content:
            yield delta.content
