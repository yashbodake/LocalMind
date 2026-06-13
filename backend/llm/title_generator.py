import logging
import os
from pathlib import Path

import yaml
from openai import OpenAI

logger = logging.getLogger(__name__)

_CONFIG_PATH = "config.yaml"
_client: OpenAI | None = None


def _load_config() -> dict:
    config_path = Path(_CONFIG_PATH)
    if not config_path.exists():
        config_path = Path(__file__).parent.parent / _CONFIG_PATH
    with open(config_path, "r") as f:
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


def generate_title(
    question: str, answer: str, model: str | None = None
) -> str | None:
    try:
        client = _get_client()
        config = _load_config()
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
