import yaml
from langchain_text_splitters import RecursiveCharacterTextSplitter

_CONFIG_PATH = "config.yaml"


def _load_config() -> dict:
    with open(_CONFIG_PATH, "r") as f:
        return yaml.safe_load(f)


def chunk_text(text: str) -> list[str]:
    config = _load_config()
    chunk_cfg = config["chunking"]

    splitter = RecursiveCharacterTextSplitter(
        chunk_size=chunk_cfg["chunk_size"],
        chunk_overlap=chunk_cfg["chunk_overlap"],
        separators=chunk_cfg.get("separators", ["\n\n", "\n", " ", ""]),
    )

    chunks = splitter.split_text(text)
    return chunks
