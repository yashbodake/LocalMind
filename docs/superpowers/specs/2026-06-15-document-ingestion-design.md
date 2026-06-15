# C8 — Document Ingestion Enhancements

## Date
2026-06-15

## Status
Approved

## Context
Four ingestion gaps identified in gap analysis:

1. **No web URL ingestion** — Can't ingest web pages. Users must manually copy-paste content.
2. **No re-ingest** — Changing chunk settings requires delete + re-upload. No way to re-process with new settings.
3. **No per-file error isolation** — Batch upload aborts entirely on first error. No retry for individual files.
4. **No OCR** — Scanned PDFs silently return empty text. No fallback extraction.

## Scope

### In Scope
- Web URL ingestion (fetch HTML, extract text, chunk + embed)
- Re-ingest existing documents (re-chunk with current settings)
- Per-file error isolation in batch upload + error detail response
- OCR fallback for scanned PDFs (optional dependency, graceful degradation)

### Out of Scope
- Crawling / recursive URL ingestion
- Scheduled/auto-refresh for URL sources
- OCR for images (non-PDF)
- Custom ingestion pipelines per document type

---

## Feature 1: Web URL Ingestion

**Backend:**

New dependencies: `httpx`, `beautifulsoup4` (add to requirements.txt).

New endpoint `POST /ingest/url`:
```python
class URLIngestRequest(BaseModel):
    url: str
    title: str | None = None
```

Logic:
1. Validate URL (must start with `http://` or `https://`)
2. Fetch HTML via `httpx.AsyncClient` (10s timeout, follow redirects)
3. Parse with `BeautifulSoup`, extract text from `<body>` (strip `<script>`, `<style>`, `<nav>`, `<footer>`)
4. Clean whitespace, collapse multiple newlines
5. If extracted text is empty → 422 error
6. Hash text, check for duplicates
7. Chunk + embed + save to DB (same pipeline as file ingest)
8. File type: `web`, filename: user-provided title or extracted `<title>` tag

**Frontend:**

New component: `URLIngestModal.jsx` — similar to `TextPasteModal.jsx`:
- URL input field (validated)
- Optional title field
- Submit button
- Loading state while fetching
- Error state if URL fetch fails

Add "+ Ingest URL" button in Sidebar sources section (next to "+ Paste Text").

New API function in `useChat.js`: `ingestURL(url, title)`.

---

## Feature 2: Re-ingest / Update Documents

**Backend:**

New endpoint `POST /sources/{doc_id}/reingest`:
1. Fetch document from SQLite (`get_document(doc_id)`)
2. If not found → 404
3. Delete old chunks from ChromaDB (`delete_doc(doc_id)`)
4. Re-chunk stored content with current user settings (chunk_size, chunk_overlap)
5. Re-embed and store (`embed_and_store`)
6. Update SQLite: `chunk_count`, `file_hash`, `ingested_at`
7. Return updated source info

**Frontend:**

Add "Re-ingest" button in Sidebar source list (on hover, next to delete button). Uses `RotateCcw` icon. Confirmation prompt: "Re-ingest with current settings?"

On success: refresh source list (to show updated chunk count).

New API function: `reingestDocument(docId)`.

---

## Feature 3: Per-File Error Isolation

**Backend:**

Refactor `POST /ingest` to NOT abort on first error:

New response schema:
```python
class IngestError(BaseModel):
    filename: str
    error: str

class IngestResponse(BaseModel):
    status: str
    ingested: list[IngestedFile]
    errors: list[IngestError] = []
```

Logic: Process each file in a try/except. On error, add to `errors` list and continue. If ALL files fail, return status `"error"`. If some succeed, return status `"partial"`. If all succeed, return `"success"`.

**Frontend:**

`uploadFiles()` in `useChat.js` already throws on error. Update to handle partial success:
- Return the full response (including `errors`)
- Sidebar `FileUploader.jsx` shows error messages for failed files
- Retry: individual file re-upload (user can re-select failed files)

---

## Feature 4: OCR Fallback for Scanned PDFs

**Backend:**

In `ingest/loader.py`, modify `_load_pdf()`:

```python
def _load_pdf(path: Path) -> str:
    reader = PdfReader(str(path))
    pages = []
    for page in reader.pages:
        page_text = page.extract_text()
        if page_text:
            pages.append(page_text)

    if not pages:
        logger.warning("No text extracted from PDF (possibly scanned): %s", path)
        return _try_ocr(path)
    return "\n\n".join(pages)
```

`_try_ocr(path)`:
1. Try importing `pytesseract` and `pdf2image`
2. If ImportError → raise `ValueError("PDF appears to be scanned. Install pytesseract and pdf2image for OCR support.")`
3. Convert PDF pages to images via `pdf2image.convert_from_path()`
4. Run `pytesseract.image_to_string()` on each image
5. Return concatenated text

**Dependencies:** Add `pytesseract` and `pdf2image` to requirements.txt as optional (they require system-level `tesseract-ocr` and `poppler-utils`). Document in README.

Graceful degradation: If OCR libs not installed, the error message tells the user what to install. No crash.

---

## Backend Changes Summary

| File | Change |
|------|--------|
| `backend/main.py` | New `/ingest/url` endpoint, `/sources/{doc_id}/reingest` endpoint, refactor `/ingest` for error isolation |
| `backend/ingest/loader.py` | OCR fallback in `_load_pdf` |
| `backend/models/schemas.py` | `URLIngestRequest`, `IngestError` models, `errors` field on `IngestResponse` |
| `requirements.txt` | Add `httpx`, `beautifulsoup4`, `pytesseract`, `pdf2image` |

## Frontend Changes Summary

| File | Change |
|------|--------|
| `frontend/src/components/URLIngestModal.jsx` | New — URL input modal |
| `frontend/src/components/Sidebar.jsx` | "+ Ingest URL" button, "Re-ingest" button on sources, error display |
| `frontend/src/components/FileUploader.jsx` | Handle partial success response |
| `frontend/src/hooks/useChat.js` | `ingestURL()`, `reingestDocument()` functions |

## Testing

1. Ingest a web URL → verify text extracted and queryable
2. Change chunk settings, re-ingest a document → verify chunk count changes
3. Upload batch with one bad file → verify other files succeed, error shown for bad file
4. Upload a scanned PDF (if OCR available) → verify text extracted
5. Upload a scanned PDF (without OCR) → verify helpful error message
