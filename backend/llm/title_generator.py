import logging

from llm.client import get_client, load_config

logger = logging.getLogger(__name__)


def generate_title(
    question: str, answer: str, model: str | None = None
) -> str | None:
    try:
        client = get_client()
        config = load_config()
        use_model = model or config["llm"]["model"]

        response = client.chat.completions.create(
            model=use_model,
            messages=[
                {
                    "role": "system",
                    "content": "Summarize the following Q&A in 3-5 words. Output only the title, no quotes, no punctuation.",
                },
                {
                    "role": "user",
                    "content": f"Q: {question}\nA: {answer[:500]}",
                },
            ],
            max_tokens=20,
            temperature=0.3,
            stream=False,
        )

        title = response.choices[0].message.content.strip()
        return title if title else None
    except Exception as e:
        logger.warning("Title generation failed: %s", e)
        return None
