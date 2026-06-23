import logging
from pathlib import Path

import pymupdf4llm

logger = logging.getLogger(__name__)

SUPPORTED_EXTENSIONS = {".txt", ".md", ".pdf"}


def load_file(path: str | Path) -> str:
    path = Path(path)
    ext = path.suffix.lower()

    if ext not in SUPPORTED_EXTENSIONS:
        raise ValueError(
            f"Unsupported file type '{ext}'. Only {', '.join(sorted(SUPPORTED_EXTENSIONS))} are supported."
        )

    if not path.exists():
        raise FileNotFoundError(f"File not found: {path}")

    if ext == ".pdf":
        return _load_pdf(path)
    return _load_text(path)


def _load_text(path: Path) -> str:
    text = path.read_text(encoding="utf-8")
    if not text.strip():
        logger.warning("File is empty: %s", path)
    return text


def _load_pdf(path: Path) -> str:
    try:
        text = pymupdf4llm.to_markdown(str(path))
    except Exception as e:
        logger.exception("PyMuPDF4LLM failed on %s", path)
        raise ValueError(f"Failed to parse PDF: {e}") from e

    if not text or not text.strip():
        raise ValueError(
            "No text extracted from PDF. If this is a scanned document, "
            "install Tesseract OCR for automatic OCR support."
        )

    logger.info("PyMuPDF4LLM extracted %d chars from %s", len(text), path.name)
    return text
