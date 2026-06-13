import os
from pathlib import Path

import yaml
from openai import OpenAI

_CONFIG_PATHS = [
    "config.yaml",
    str(Path(__file__).resolve().parent.parent / "config.yaml"),
]
_client: OpenAI | None = None


def load_config() -> dict:
    for path in _CONFIG_PATHS:
        try:
            with open(path, "r") as f:
                return yaml.safe_load(f)
        except FileNotFoundError:
            continue
    raise FileNotFoundError("config.yaml not found in any expected location")


def get_client() -> OpenAI:
    global _client
    if _client is None:
        config = load_config()
        _client = OpenAI(
            base_url=config["llm"]["base_url"],
            api_key=os.getenv("NVIDIA_API_KEY"),
        )
    return _client
