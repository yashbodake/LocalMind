import logging

from llm.client import get_client, load_config

logger = logging.getLogger(__name__)


def generate_followups(question: str, answer: str, model: str | None = None) -> list[str]:
    try:
        client = get_client()
        config = load_config()
        use_model = model or config["llm"]["model"]

        response = client.chat.completions.create(
            model=use_model,
            messages=[
                {
                    "role": "system",
                    "content": "Based on this Q&A, suggest 3 concise follow-up questions. Output one per line, no numbering, no quotes.",
                },
                {
                    "role": "user",
                    "content": f"Q: {question}\nA: {answer[:1000]}",
                },
            ],
            max_tokens=100,
            temperature=0.5,
            stream=False,
        )

        text = response.choices[0].message.content.strip()
        return [q.strip() for q in text.split("\n") if q.strip()][:3]
    except Exception as e:
        logger.warning("Follow-up generation failed: %s", e)
        return []
