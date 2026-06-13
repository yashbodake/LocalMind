import yaml
from langchain_text_splitters import RecursiveCharacterTextSplitter

_CONFIG_PATH = "config.yaml"


def _load_config() -> dict:
    with open(_CONFIG_PATH, "r") as f:
        return yaml.safe_load(f)


def chunk_text(text: str, chunk_size: int | None = None, chunk_overlap: int | None = None) -> list[str]:
    config = _load_config()
    chunk_cfg = config["chunking"]

    use_size = chunk_size or chunk_cfg["chunk_size"]
    use_overlap = chunk_overlap or chunk_cfg["chunk_overlap"]

    splitter = RecursiveCharacterTextSplitter(
        chunk_size=use_size,
        chunk_overlap=use_overlap,
        separators=chunk_cfg.get("separators", ["\n\n", "\n", " ", ""]),
    )

    chunks = splitter.split_text(text)
    return chunks
