# C4 — Document Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development

**Goal:** Add a documents SQLite table, document preview, bulk delete, duplicate detection, and text paste ingestion.

**Architecture:** New `documents` table in SQLite stores metadata + full content. Backend enriches ingest pipeline with hash-based dedup. Frontend adds preview modal, text paste modal, and bulk delete UI.

**Tech Stack:** FastAPI, SQLite, ChromaDB, React 19

---

### Task 1: Backend — documents table + CRUD

**Files:** Modify `backend/database.py`

- [ ] **Step 1:** Read database.py to find init_db and verify imports (`datetime`, `UTC`, `json`)

- [ ] **Step 2:** In `init_db()`, after existing CREATE TABLE statements, add:

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

- [ ] **Step 3:** Add CRUD functions at the end of the file:

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
    if not doc_ids:
        return 0
    conn = get_db()
    cursor = conn.cursor()
    placeholders = ",".join("?" * len(doc_ids))
    cursor.execute(f"DELETE FROM documents WHERE doc_id IN ({placeholders})", doc_ids)
    conn.commit()
    return cursor.rowcount
```

- [ ] **Step 4:** Verify: `cd backend && python -c "from database import save_document, get_document, get_document_by_hash, list_documents, delete_document, delete_documents_bulk; print('OK')"`

- [ ] **Step 5:** Commit: `git add backend/database.py && git commit -m "feat: add documents table + CRUD functions to database.py"`

---

### Task 2: Backend — update schemas

**Files:** Modify `backend/models/schemas.py`

- [ ] **Step 1:** Read current schemas.py

- [ ] **Step 2:** Update `SourceInfo` to add `file_type` and `word_count`:

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

- [ ] **Step 3:** Add `TextIngestRequest` model:

```python
class TextIngestRequest(BaseModel):
    text: str
    title: str | None = None
```

- [ ] **Step 4:** Commit: `git add backend/models/schemas.py && git commit -m "feat: update SourceInfo + add TextIngestRequest schema"`

---

### Task 3: Backend — update main.py endpoints

**Files:** Modify `backend/main.py`

This is the largest backend task. Read main.py carefully first.

- [ ] **Step 1:** Add imports at the top:

```python
import hashlib
from database import (
    save_document, get_document, get_document_by_hash,
    list_documents, delete_document, delete_documents_bulk
)
```

(Add the database imports alongside existing imports. Add `hashlib` to standard library imports.)

- [ ] **Step 2:** Modify `POST /ingest` — add duplicate detection + metadata storage

In the `ingest_files` function, find the loop body. After `text = load_file(tmp_path)` and before chunking/embedding, add:

```python
            file_hash = hashlib.sha256(text.encode()).hexdigest()
            existing_doc = get_document_by_hash(file_hash)
            if existing_doc:
                ingested.append(IngestedFile(
                    filename=uploaded.filename,
                    chunks=existing_doc["chunk_count"],
                    doc_id=existing_doc["doc_id"]
                ))
                continue
```

After the `embed_and_store` call and before appending to `ingested`, add:

```python
            word_count = len(text.split())
            file_type = uploaded.filename.rsplit(".", 1)[-1].lower() if "." in uploaded.filename else "unknown"
            save_document(
                doc_id=doc_id,
                filename=uploaded.filename,
                file_type=file_type,
                size_kb=size_kb,
                word_count=word_count,
                chunk_count=len(chunks),
                file_hash=file_hash,
                content=text,
            )
```

- [ ] **Step 3:** Add `POST /ingest/text` endpoint — register BEFORE any path-parameter routes

```python
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
    metadata = {"doc_id": doc_id, "filename": title, "source_path": title}
    embed_and_store(chunks, metadata)

    save_document(
        doc_id=doc_id, filename=title, file_type=file_type,
        size_kb=size_kb, word_count=word_count, chunk_count=len(chunks),
        file_hash=file_hash, content=text,
    )

    return IngestResponse(
        status="success",
        ingested=[IngestedFile(filename=title, chunks=len(chunks), doc_id=doc_id)]
    )
```

Add import for TextIngestRequest from schemas.

- [ ] **Step 4:** Modify `GET /sources` — read from SQLite

Replace the entire `get_sources` function body:

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

- [ ] **Step 5:** Add `GET /sources/bulk` DELETE endpoint — register BEFORE `DELETE /sources/{doc_id}`:

```python
@app.delete("/sources/bulk")
async def remove_sources_bulk(doc_ids: list[str]):
    for doc_id in doc_ids:
        try:
            delete_doc(doc_id)
        except Exception as e:
            logger.warning("Failed to delete %s from ChromaDB: %s", doc_id, e)
    deleted = delete_documents_bulk(doc_ids)
    return {"status": "ok", "deleted_count": deleted}
```

- [ ] **Step 6:** Modify `DELETE /sources/{doc_id}` — also delete from SQLite:

Add `delete_document(doc_id)` call after `delete_doc(doc_id)`:

```python
@app.delete("/sources/{doc_id}", response_model=DeleteResponse)
async def remove_source(doc_id: str):
    delete_doc(doc_id)
    delete_document(doc_id)
    return DeleteResponse(status="deleted", doc_id=doc_id)
```

- [ ] **Step 7:** Add `GET /sources/{doc_id}/content` endpoint:

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

IMPORTANT: Register the `/sources/bulk` DELETE route BEFORE `/sources/{doc_id}` DELETE route to avoid FastAPI matching "bulk" as a doc_id.

- [ ] **Step 8:** Verify: `cd backend && python -c "from main import app; print('OK')"`

- [ ] **Step 9:** Commit: `git add backend/main.py backend/models/schemas.py && git commit -m "feat: enriched ingest, text ingest, bulk delete, content preview endpoints"`

---

### Task 4: Frontend — API functions

**Files:** Modify `frontend/src/hooks/useChat.js`

- [ ] **Step 1:** Add these functions:

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

- [ ] **Step 2:** Commit: `git add frontend/src/hooks/useChat.js && git commit -m "feat: add getDocumentContent, bulkDeleteSources, ingestText API functions"`

---

### Task 5: Frontend — DocumentPreview.jsx

**Files:** Create `frontend/src/components/DocumentPreview.jsx`

```jsx
import { useState, useEffect } from "react";
import { X, FileText } from "lucide-react";
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
        className="bg-surface border border-line rounded-2xl w-full max-w-3xl max-h-[80vh] flex flex-col mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-5 py-3 border-b border-line">
          <FileText size={16} className="text-accent shrink-0" aria-hidden="true" />
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
            className="p-1.5 rounded-lg text-fg-muted hover:text-fg hover:bg-elevated transition-colors shrink-0"
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

- [ ] **Commit:** `git add frontend/src/components/DocumentPreview.jsx && git commit -m "feat: add DocumentPreview modal component"`

---

### Task 6: Frontend — TextPasteModal.jsx

**Files:** Create `frontend/src/components/TextPasteModal.jsx`

```jsx
import { useState } from "react";
import { X } from "lucide-react";

export default function TextPasteModal({ onClose, onSubmit }) {
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async () => {
    if (!text.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit({ title: title.trim() || "Pasted Note", text: text.trim() });
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
        className="bg-surface border border-line rounded-2xl w-full max-w-2xl flex flex-col mx-4"
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

- [ ] **Commit:** `git add frontend/src/components/TextPasteModal.jsx && git commit -m "feat: add TextPasteModal component"`

---

### Task 7: Frontend — Update Sidebar.jsx

**Files:** Modify `frontend/src/components/Sidebar.jsx`

Read the current file carefully. Make these changes:

- [ ] **Step 1:** Add imports

```jsx
import DocumentPreview from "./DocumentPreview";
import TextPasteModal from "./TextPasteModal";
import { bulkDeleteSources, ingestText } from "../hooks/useChat";
```

Add `Trash2` to lucide-react imports if not already present.

- [ ] **Step 2:** Add state for modals + bulk mode

```jsx
  const [previewDoc, setPreviewDoc] = useState(null);
  const [showPasteModal, setShowPasteModal] = useState(false);
  const [bulkMode, setBulkMode] = useState(false);
  const [bulkSelected, setBulkSelected] = useState(new Set());
```

- [ ] **Step 3:** Add handlers

```jsx
  const toggleBulk = (docId) => {
    setBulkSelected((prev) => {
      const next = new Set(prev);
      if (next.has(docId)) next.delete(docId);
      else next.add(docId);
      return next;
    });
  };

  const handleBulkDelete = async () => {
    const ids = Array.from(bulkSelected);
    if (ids.length === 0) return;
    if (!window.confirm(`Delete ${ids.length} document${ids.length !== 1 ? "s" : ""}?`)) return;
    try {
      await bulkDeleteSources(ids);
      setBulkSelected(new Set());
      setBulkMode(false);
      refresh();
    } catch (e) {
      console.error("Bulk delete failed:", e);
    }
  };

  const handlePasteSubmit = async ({ title, text }) => {
    await ingestText(title, text);
    refresh();
  };
```

- [ ] **Step 4:** Add bulk mode toggle in sources header

In the sources header section (next to the select all/deselect all toggle), add a bulk mode button:

```jsx
<button
  onClick={() => { setBulkMode(!bulkMode); setBulkSelected(new Set()); }}
  className={`text-[10px] font-mono transition-colors ${bulkMode ? "text-accent" : "text-fg-muted hover:text-fg-secondary"}`}
>
  {bulkMode ? "Cancel" : "Bulk"}
</button>
```

When bulkMode is active and items are selected, show delete button:

```jsx
{bulkMode && bulkSelected.size > 0 && (
  <button
    onClick={handleBulkDelete}
    className="text-[10px] text-accent hover:text-accent/80 font-sans ml-2"
  >
    Delete ({bulkSelected.size})
  </button>
)}
```

- [ ] **Step 5:** Update source row rendering

When bulkMode is active, show a bulk-select checkbox instead of the query-scoping checkbox. When NOT in bulkMode, make the filename clickable to open preview:

```jsx
{/* In bulk mode: bulk checkbox */}
{bulkMode ? (
  <input
    type="checkbox"
    checked={bulkSelected.has(source.doc_id)}
    onChange={() => toggleBulk(source.doc_id)}
    className="accent-accent w-3 h-3"
    aria-label={`Select ${source.filename} for deletion`}
  />
) : (
  /* Normal mode: query-scoping checkbox (existing) */
  <input
    type="checkbox"
    checked={selectedDocIds?.includes(source.doc_id) ?? false}
    onChange={() => onSelectDocIds(...)}
    ...
  />
)}
```

Make filename clickable to open preview (only in non-bulk mode):

```jsx
<button
  onClick={() => !bulkMode && setPreviewDoc({ docId: source.doc_id, filename: source.filename })}
  className="text-fg-secondary text-xs font-medium truncate hover:text-accent transition-colors text-left"
>
  {source.filename}
</button>
```

Add metadata display (file type + size) after the chunk count:

```jsx
{source.file_type && source.file_type !== "unknown" && (
  <span className="font-mono text-[9px] text-fg-muted uppercase">{source.file_type}</span>
)}
{source.size_kb > 0 && (
  <span className="font-mono text-[9px] text-fg-muted">
    {source.size_kb < 1024 ? `${source.size_kb.toFixed(1)}KB` : `${(source.size_kb / 1024).toFixed(1)}MB`}
  </span>
)}
```

- [ ] **Step 6:** Add "Paste Text" button below FileUploader

After the FileUploader component in the sidebar, add:

```jsx
<button
  onClick={() => setShowPasteModal(true)}
  className="w-full py-1.5 text-[11px] font-sans text-fg-muted hover:text-accent border border-line rounded-lg transition-colors"
>
  + Paste Text
</button>
```

- [ ] **Step 7:** Render modals at the bottom of the Sidebar component

```jsx
{previewDoc && (
  <DocumentPreview
    docId={previewDoc.docId}
    filename={previewDoc.filename}
    onClose={() => setPreviewDoc(null)}
  />
)}
{showPasteModal && (
  <TextPasteModal
    onClose={() => setShowPasteModal(false)}
    onSubmit={handlePasteSubmit}
  />
)}
```

- [ ] **Step 8:** Verify build: `cd frontend && npm run build`

- [ ] **Step 9:** Commit: `git add frontend/src/components/Sidebar.jsx && git commit -m "feat: document preview, bulk delete, text paste in Sidebar"`

---

### Task 8: Final build + push

- [ ] **Step 1:** `cd frontend && npm run build`
- [ ] **Step 2:** `cd backend && python -c "from main import app; print('OK')"`
- [ ] **Step 3:** `git push origin main`
