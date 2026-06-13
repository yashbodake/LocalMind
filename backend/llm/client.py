import os

import yaml
from openai import OpenAI

_CONFIG_PATH = "config.yaml"
_client: OpenAI | None = None


def load_config() -> dict:
    with open(_CONFIG_PATH, "r") as f:
        return yaml.safe_load(f)


def get_client() -> OpenAI:
    global _client
    if _client is None:
        config = load_config()
        _client = OpenAI(
            base_url=config["llm"]["base_url"],
            api_key=os.getenv("NVIDIA_API_KEY"),
        )
    return _client
