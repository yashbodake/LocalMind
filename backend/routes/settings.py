import logging
from fastapi import APIRouter
from pydantic import BaseModel

from database import get_all_settings, set_setting
from llm.client import load_config

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/settings", tags=["settings"])


VALID_KEYS = {
    "retrieval.top_k",
    "retrieval.similarity_threshold",
    "llm.temperature",
    "llm.max_tokens",
    "llm.system_prompt",
    "chunking.chunk_size",
    "chunking.chunk_overlap",
    "embedding.model",
}

VALID_KEY_PREFIXES = (
    "llm.temperature.",
    "llm.max_tokens.",
)


def _is_valid_key(key: str) -> bool:
    return key in VALID_KEYS or any(key.startswith(p) for p in VALID_KEY_PREFIXES)


class SettingsUpdate(BaseModel):
    settings: dict[str, str]


@router.get("")
async def get_settings():
    config = load_config()
    user_settings = get_all_settings()

    defaults = {
        "retrieval.top_k": str(config["retrieval"]["top_k"]),
        "retrieval.similarity_threshold": str(config["retrieval"]["similarity_threshold"]),
        "llm.temperature": str(config["llm"]["temperature"]),
        "llm.max_tokens": str(config["llm"]["max_tokens"]),
        "llm.system_prompt": "",
        "chunking.chunk_size": str(config["chunking"]["chunk_size"]),
        "chunking.chunk_overlap": str(config["chunking"]["chunk_overlap"]),
    }

    effective = {}
    for key, default_val in defaults.items():
        user_val = user_settings.get(key, "")
        effective[key] = user_val if user_val else default_val

    return {"defaults": defaults, "overrides": user_settings, "effective": effective}


@router.put("")
async def update_settings(payload: SettingsUpdate):
    for key, value in payload.settings.items():
        if _is_valid_key(key):
            set_setting(key, value)
    return {"status": "ok"}
