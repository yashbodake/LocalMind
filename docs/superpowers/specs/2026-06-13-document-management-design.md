# C4 — Document Management Design Spec

**Date:** 2026-06-13  
**Status:** Draft  
**Depends on:** Nothing (independent)  
**Required by:** Nothing

## Problem

Documents are stored only as ChromaDB chunk metadata — no dedicated table, no content preview, broken size field, no bulk delete, no duplicate detection, no text paste ingestion. Users can't verify what was ingested, can't delete efficiently, and can't add quick notes.

## Solution

Five features: (1) create a `documents` SQLite table as the source of truth for metadata, (2) document preview modal showing extracted text, (3) bulk select & delete, (4) duplicate file detection via content hash, (5) text paste ingestion for quick notes.

## Architecture

```
Backend Changes:
  database.py
    └─ New documents table: id, doc_id, filename, file_type, size_kb, word_count,
       chunk_count, file_hash, content (full text), ingested_at
    └─ init_db: CREATE TABLE + migration
    └─ CRUD: save_document, get_document, get_document_by_hash, list_documents,
       delete_document, delete_documents_bulk
  ingest/embedder.py
    └─ list_sources: reads from SQLite documents table (not Chroma scan)
    └─ delete_doc: also delete from SQLite
  main.py
    └─ POST /ingest: store metadata + content in SQLite, hash check for dupes
    └─ POST /ingest/text: accept text, create virtual document
    └─ GET /sources/{doc_id}/content: return full text
    └─ DELETE /sources/bulk: delete multiple docs
    └─ GET /sources: return enriched metadata
  models/schemas.py
    └─ Update SourceInfo with file_type, word_count, file_hash

Frontend Changes:
  Sidebar.jsx
    ├─ Metadata display (file type icon, size, word count)
    ├─ Bulk select mode with delete button
    └─ Click document name → preview modal
  DocumentPreview.jsx (new)
    └─ Modal showing full document text with metadata header
  TextPasteModal.jsx (new)
    └─ Modal with textarea + title input for text ingestion
  FileUploader.jsx
    └─ "Paste Text" button alongside drag-drop
  useChat.js
    └─ getDocumentContent, bulkDeleteSources, ingestText
```

## 1. Documents SQLite Table

### Schema

```sql
CREATE TABLE IF NOT EXISTS documents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    doc_id TEXT UNIQUE NOT NULL,
    filename TEXT NOT NULL,
    file_type TEXT NOT NULL,          -- 'pdf', 'txt', 'md', 'text'
    size_kb REAL DEFAULT 0.0,
    word_count INTEGER DEFAULT 0,
    chunk_count INTEGER DEFAULT 0,
    file_hash TEXT,                    -- SHA-256 of file content
    content TEXT,                      -- full extracted text
    ingested_at TEXT NOT NULL,
    FOREIGN KEY (doc_id) REFERENCES sessions(doc_ids) -- conceptual only
);
```

### database.py functions

```python
def save_document(doc_id, filename, file_type, size_kb, word_count, chunk_count, file_hash, content):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute(
        """INSERT INTO documents (doc_id, filename, file_type, size_kb, word_count, chunk_count, file_hash, content, ingested_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (doc_id, filename, file_type, size_kb, word_count, chunk_count, file_hash, content, _now())
    )
    conn.commit()
    return cursor.lastrowid

def get_document(doc_id):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM documents WHERE doc_id = ?", (doc_id,))
    row = cursor.fetchone()
    if not row:
        return None
    return dict(row)

def get_document_by_hash(file_hash):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM documents WHERE file_hash = ?", (file_hash,))
    row = cursor.fetchone()
    return dict(row) if row else None

def list_documents():
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM documents ORDER BY ingested_at DESC")
    return [dict(row) for row in cursor.fetchall()]

def delete_document(doc_id):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM documents WHERE doc_id = ?", (doc_id,))
    conn.commit()
    return cursor.rowcount > 0

def delete_documents_bulk(doc_ids):
    conn = get_db()
    cursor = conn.cursor()
    placeholders = ",".join("?" * len(doc_ids))
    cursor.execute(f"DELETE FROM documents WHERE doc_id IN ({placeholders})", doc_ids)
    conn.commit()
    return cursor.rowcount
```

### Migration

In `init_db()`, after existing CREATE TABLE statements:
```python
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS documents (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            doc_id TEXT UNIQUE NOT NULL,
            filename TEXT NOT NULL,
            file_type TEXT NOT NULL,
            size_kb REAL DEFAULT 0.0,
            word_count INTEGER DEFAULT 0,
            chunk_count INTEGER DEFAULT 0,
            file_hash TEXT,
            content TEXT,
            ingested_at TEXT NOT NULL
        )
    """)
```

## 2. Backend — Enriched Ingest Pipeline

### `POST /ingest` modifications

In `main.py`'s `ingest_files()`:

After successful embedding (after `embed_and_store`), compute and store metadata:

```python
import hashlib

# After chunking, before or after embedding:
file_hash = hashlib.sha256(raw_text.encode()).hexdigest()
word_count = len(raw_text.split())
file_type = filename.rsplit(".", 1)[-1].lower() if "." in filename else "unknown"

# Check for duplicate
existing = get_document_by_hash(file_hash)
if existing:
    # Skip, return as already ingested
    results.append(IngestedFile(filename=filename, chunks=existing["chunk_count"], doc_id=existing["doc_id"]))
    continue

# After embed_and_store:
save_document(
    doc_id=doc_id,
    filename=filename,
    file_type=file_type,
    size_kb=size_kb,
    word_count=word_count,
    chunk_count=len(chunks),
    file_hash=file_hash,
    content=raw_text,
)
```

The `raw_text` variable is the output of `load_file()` — it's already available in the pipeline.

### `POST /ingest/text` — New endpoint

```python
from models.schemas import TextIngestRequest

@app.post("/ingest/text")
async def ingest_text(payload: TextIngestRequest):
    text = payload.text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="Text cannot be empty")

    title = payload.title or "Pasted Note"
    file_hash = hashlib.sha256(text.encode()).hexdigest()
    existing = get_document_by_hash(file_hash)
    if existing:
        return IngestResponse(
            status="duplicate",
            ingested=[IngestedFile(filename=existing["filename"], chunks=existing["chunk_count"], doc_id=existing["doc_id"])]
        )

    doc_id = uuid4().hex[:12]
    file_type = "text"
    size_kb = len(text.encode()) / 1024
    word_count = len(text.split())

    chunks = chunk_text(text)
    embed_and_store(
        chunks=chunks,
        doc_id=doc_id,
        filename=title,
        source_path=title,
    )

    save_document(
        doc_id=doc_id,
        filename=title,
        file_type=file_type,
        size_kb=size_kb,
        word_count=word_count,
        chunk_count=len(chunks),
        file_hash=file_hash,
        content=text,
    )

    return IngestResponse(
        status="success",
        ingested=[IngestedFile(filename=title, chunks=len(chunks), doc_id=doc_id)]
    )
```

New Pydantic model in `schemas.py`:
```python
class TextIngestRequest(BaseModel):
    text: str
    title: str | None = None
```

### `GET /sources` — Return from SQLite

Modify `get_sources()` in `main.py` to read from SQLite:

```python
@app.get("/sources", response_model=SourcesResponse)
async def get_sources():
    docs = list_documents()
    return SourcesResponse(
        sources=[
            SourceInfo(
                doc_id=d["doc_id"],
                filename=d["filename"],
                chunks=d["chunk_count"],
                ingested_at=d["ingested_at"],
                size_kb=d["size_kb"],
                file_type=d["file_type"],
                word_count=d["word_count"],
            )
            for d in docs
        ]
    )
```

Update `SourceInfo` in schemas.py:
```python
class SourceInfo(BaseModel):
    doc_id: str
    filename: str
    chunks: int
    ingested_at: str
    size_kb: float = 0.0
    file_type: str = "unknown"
    word_count: int = 0
```

### `GET /sources/{doc_id}/content` — Preview endpoint

```python
@app.get("/sources/{doc_id}/content")
async def get_source_content(doc_id: str):
    doc = get_document(doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    return {
        "doc_id": doc["doc_id"],
        "filename": doc["filename"],
        "content": doc["content"],
        "file_type": doc["file_type"],
        "size_kb": doc["size_kb"],
        "word_count": doc["word_count"],
        "chunk_count": doc["chunk_count"],
        "ingested_at": doc["ingested_at"],
    }
```

### `DELETE /sources/bulk` — Bulk delete

```python
@app.delete("/sources/bulk")
async def remove_sources_bulk(doc_ids: list[str]):
    for doc_id in doc_ids:
        delete_doc(doc_id)
    deleted = delete_documents_bulk(doc_ids)
    return {"status": "ok", "deleted_count": deleted}
```

Important: Route ordering — `DELETE /sources/bulk` must be registered BEFORE `DELETE /sources/{doc_id}` to avoid FastAPI matching "bulk" as a doc_id.

### `DELETE /sources/{doc_id}` — Also delete from SQLite

Modify existing `remove_source()`:
```python
@app.delete("/sources/{doc_id}", response_model=DeleteResponse)
async def remove_source(doc_id: str):
    delete_doc(doc_id)        # ChromaDB
    delete_document(doc_id)   # SQLite
    return DeleteResponse(status="deleted", doc_id=doc_id)
```

## 3. Frontend — Document Preview Modal

### `DocumentPreview.jsx` (new)

```jsx
import { useState, useEffect } from "react";
import { X, FileText, File, FileType } from "lucide-react";
import { getDocumentContent } from "../hooks/useChat";

export default function DocumentPreview({ docId, filename, onClose }) {
  const [content, setContent] = useState("");
  const [meta, setMeta] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!docId) return;
    setLoading(true);
    getDocumentContent(docId)
      .then((data) => {
        setContent(data.content || "");
        setMeta(data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [docId]);

  const formatSize = (kb) => {
    if (kb < 1) return `${(kb * 1024).toFixed(0)} B`;
    if (kb < 1024) return `${kb.toFixed(1)} KB`;
    return `${(kb / 1024).toFixed(1)} MB`;
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-surface border border-line rounded-2xl w-full max-w-3xl max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-5 py-3 border-b border-line">
          <FileText size={16} className="text-accent" aria-hidden="true" />
          <div className="flex-1 min-w-0">
            <h3 className="text-fg text-sm font-semibold truncate">{filename}</h3>
            {meta && (
              <div className="flex gap-3 mt-0.5 text-[10px] font-mono text-fg-muted">
                <span>{meta.file_type}</span>
                <span>{formatSize(meta.size_kb)}</span>
                <span>{meta.word_count} words</span>
                <span>{meta.chunk_count} chunks</span>
              </div>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-fg-muted hover:text-fg hover:bg-elevated transition-colors"
            aria-label="Close preview"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {loading ? (
            <p className="text-fg-muted text-sm">Loading…</p>
          ) : (
            <pre className="text-fg-secondary text-xs whitespace-pre-wrap font-sans leading-relaxed">
              {content}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}
```

## 4. Frontend — Text Paste Modal

### `TextPasteModal.jsx` (new)

```jsx
import { useState } from "react";
import { X } from "lucide-react";

export default function TextPasteModal({ onClose, onSuccess }) {
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async () => {
    if (!text.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      await onSuccess({ title: title.trim() || "Pasted Note", text: text.trim() });
      onClose();
    } catch (e) {
      setError(e.message || "Failed to ingest text");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-surface border border-line rounded-2xl w-full max-w-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-line">
          <h3 className="text-fg text-sm font-semibold">Paste Text</h3>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-fg-muted hover:text-fg hover:bg-elevated transition-colors"
            aria-label="Close"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>
        <div className="px-5 py-4 space-y-3">
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Title (optional)"
            className="w-full bg-base border border-line rounded-lg px-3 py-2 text-fg text-sm outline-none focus:border-accent/30"
            aria-label="Document title"
          />
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Paste your text here…"
            rows={10}
            className="w-full bg-base border border-line rounded-lg px-3 py-2 text-fg text-sm outline-none focus:border-accent/30 resize-none font-sans"
            aria-label="Text content"
          />
          {error && <p className="text-accent text-xs">{error}</p>}
        </div>
        <div className="flex justify-end gap-2 px-5 py-3 border-t border-line">
          <button
            onClick={onClose}
            className="px-3 py-1.5 border border-line rounded-lg text-fg-muted hover:text-fg text-xs transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!text.trim() || submitting}
            className="px-3 py-1.5 border border-accent/30 bg-accent/10 rounded-lg text-accent text-xs disabled:opacity-30 transition-colors"
          >
            {submitting ? "Ingesting…" : "Ingest Text"}
          </button>
        </div>
      </div>
    </div>
  );
}
```

## 5. Frontend — Sidebar Updates

### Metadata display

Each source row shows file type icon + size:

```jsx
const fileTypeIcon = (type) => {
  if (type === "pdf") return <FileType size={12} aria-hidden="true" />;
  return <FileText size={12} aria-hidden="true" />;
};

// In the source row:
{source.file_type && (
  <span className="font-mono text-[9px] text-fg-muted uppercase">
    {source.file_type}
  </span>
)}
{source.size_kb > 0 && (
  <span className="font-mono text-[9px] text-fg-muted">
    {source.size_kb < 1024 ? `${source.size_kb.toFixed(1)}KB` : `${(source.size_kb / 1024).toFixed(1)}MB`}
  </span>
)}
```

### Click document name → preview

```jsx
<button
  onClick={() => setPreviewDoc({ docId: source.doc_id, filename: source.filename })}
  className="text-fg-secondary text-xs font-medium truncate hover:text-accent transition-colors text-left"
>
  {source.filename}
</button>
```

### Bulk delete

Add a bulk select mode toggle. When active, checkboxes become delete checkboxes:

```jsx
const [bulkMode, setBulkMode] = useState(false);
const [bulkSelected, setBulkSelected] = useState(new Set());

const handleBulkDelete = async () => {
  const ids = Array.from(bulkSelected);
  await bulkDeleteSources(ids);
  setBulkSelected(new Set());
  setBulkMode(false);
  refresh();
};
```

UI for bulk mode:

```jsx
{bulkMode && bulkSelected.size > 0 && (
  <button
    onClick={handleBulkDelete}
    className="text-[10px] text-accent hover:text-accent/80 font-sans"
  >
    Delete ({bulkSelected.size})
  </button>
)}
```

## 6. Frontend — useChat.js additions

```javascript
export async function getDocumentContent(docId) {
  const res = await fetch(`${API_BASE}/sources/${docId}/content`);
  if (!res.ok) throw new Error("Failed to load document");
  return res.json();
}

export async function bulkDeleteSources(docIds) {
  const res = await fetch(`${API_BASE}/sources/bulk`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(docIds),
  });
  if (!res.ok) throw new Error("Failed to delete sources");
  return res.json();
}

export async function ingestText(title, text) {
  const res = await fetch(`${API_BASE}/ingest/text`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title, text }),
  });
  if (!res.ok) throw new Error("Failed to ingest text");
  return res.json();
}
```

## 7. Frontend — FileUpdater.jsx addition

Add a "Paste Text" button below the drag-drop zone:

```jsx
<button
  onClick={() => onPasteText?.()}
  className="w-full py-1.5 text-[11px] font-sans text-fg-muted hover:text-accent border border-line rounded-lg transition-colors"
>
  + Paste Text Instead
</button>
```

Sidebar manages the modal state and passes `onPasteText` to FileUploader.

## Error Handling

| Scenario | Behavior |
|---|---|
| Duplicate file uploaded | Returns existing doc_id, status="duplicate", no re-ingestion |
| Document content not found (missing from SQLite) | 404 from content endpoint |
| Bulk delete with empty list | Returns deleted_count: 0 |
| Text paste with empty text | 400 error |
| Preview of deleted document | Modal shows loading then empty |

## Constraints

- `documents` table content column stores full extracted text — could be large for big PDFs. Acceptable for local-first app.
- Duplicate detection uses SHA-256 hash of extracted text (not raw file bytes) — two different files with same text content are treated as duplicates
- `GET /sources` now reads from SQLite, not ChromaDB — ChromaDB is still the source for vector search
- Migration: existing ChromaDB-only documents won't appear in the documents table until re-uploaded. Acceptable for pre-production.
