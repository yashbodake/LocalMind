import logging
from pathlib import Path

from pypdf import PdfReader

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
    reader = PdfReader(str(path))
    pages = []
    for page in reader.pages:
        page_text = page.extract_text()
        if page_text:
            pages.append(page_text)

    if not pages:
        logger.warning("No text extracted from PDF (possibly scanned): %s", path)
        return ""

    return "\n\n".join(pages)
