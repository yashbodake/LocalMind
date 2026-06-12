# LocalMind — Technical Specification

**Version:** 1.0.0  
**Status:** In Development  
**Last Updated:** 2025-06

---

## 1. Project Overview

LocalMind is a self-hosted Retrieval-Augmented Generation (RAG) system that allows users to build a personal knowledge base from their own documents (Markdown, PDF, TXT) and query it using natural language. The system uses hybrid semantic search powered by BGE-Small embeddings and generates cited answers via NVIDIA NIM LLMs.

### 1.1 Goals

- Ingest personal notes/documents into a searchable vector store
- Answer natural language questions with cited source chunks
- Keep the stack lightweight and locally runnable
- Expose a clean REST API consumed by a React frontend
- Streaming LLM responses for a snappy UX

### 1.2 Non-Goals (v1.0)

- Multi-user authentication
- Cloud deployment / SaaS
- Real-time document sync (e.g. Google Drive live sync)
- Image/table understanding inside PDFs

---

## 2. System Architecture

```
┌─────────────────────────────────────┐
│           React Frontend            │
│   (Chat UI + File Uploader)         │
└────────────────┬────────────────────┘
                 │ HTTP / SSE
┌────────────────▼────────────────────┐
│           FastAPI Backend           │
│  ┌──────────┐  ┌──────────────────┐ │
│  │  Ingest  │  │  Query Pipeline  │ │
│  │  Router  │  │     Router       │ │
│  └────┬─────┘  └────────┬─────────┘ │
│       │                 │           │
│  ┌────▼─────┐  ┌────────▼─────────┐ │
│  │ Chunker  │  │   Retriever      │ │
│  │ Embedder │  │ (Cosine Search)  │ │
│  └────┬─────┘  └────────┬─────────┘ │
│       │                 │           │
│  ┌────▼─────────────────▼─────────┐ │
│  │         ChromaDB               │ │
│  │   (Persistent Vector Store)    │ │
│  └────────────────────────────────┘ │
│                 │                   │
│  ┌──────────────▼─────────────────┐ │
│  │      NVIDIA NIM (LLM)          │ │
│  │  meta/llama-3.1-70b-instruct   │ │
│  └────────────────────────────────┘ │
└─────────────────────────────────────┘
```

---

## 3. Backend Specification

### 3.1 Technology

- **Runtime:** Python 3.11+
- **Framework:** FastAPI 0.110+
- **ASGI Server:** Uvicorn
- **Embedding Model:** `BAAI/bge-small-en-v1.5` via `sentence-transformers`
- **Vector DB:** ChromaDB 0.5+ (persistent client)
- **LLM Client:** `openai` SDK pointed at NVIDIA NIM base URL
- **File Parsing:** `pypdf` (PDF), native (MD/TXT)
- **Config:** `PyYAML` + `.env` via `python-dotenv`

### 3.2 Configuration (`config.yaml`)

```yaml
embedding:
  model: BAAI/bge-small-en-v1.5
  dimension: 384
  device: cpu                    # or cuda if available

chunking:
  strategy: recursive            # recursive | sentence | fixed
  chunk_size: 512
  chunk_overlap: 64

retrieval:
  top_k: 5
  similarity_threshold: 0.35

llm:
  provider: nvidia
  base_url: https://integrate.api.nvidia.com/v1
  model: meta/llama-3.1-70b-instruct
  max_tokens: 1024
  temperature: 0.2
  stream: true

chroma:
  path: ./chroma_db
  collection: localmind
  distance: cosine
```

### 3.3 API Endpoints

#### POST `/ingest`
Upload and ingest one or more files into the knowledge base.

**Request:** `multipart/form-data`
```
files: File[]          # .pdf, .md, .txt supported
```

**Response:** `200 OK`
```json
{
  "status": "success",
  "ingested": [
    {
      "filename": "notes.md",
      "chunks": 14,
      "doc_id": "abc123"
    }
  ]
}
```

**Error:** `422` for unsupported file type, `500` for processing failure.

---

#### GET `/sources`
List all ingested documents.

**Response:** `200 OK`
```json
{
  "sources": [
    {
      "doc_id": "abc123",
      "filename": "notes.md",
      "chunks": 14,
      "ingested_at": "2025-06-01T10:30:00Z",
      "size_kb": 12
    }
  ]
}
```

---

#### DELETE `/sources/{doc_id}`
Remove a document and all its chunks from the vector store.

**Response:** `200 OK`
```json
{ "status": "deleted", "doc_id": "abc123" }
```

---

#### POST `/query`
Ask a question against the knowledge base (non-streaming).

**Request:** `application/json`
```json
{
  "question": "What is the difference between RAG and fine-tuning?",
  "top_k": 5
}
```

**Response:** `200 OK`
```json
{
  "answer": "RAG retrieves relevant context at query time...",
  "sources": [
    {
      "doc_id": "abc123",
      "filename": "notes.md",
      "chunk_index": 3,
      "content": "RAG differs from fine-tuning in that...",
      "score": 0.87
    }
  ],
  "latency_ms": 420
}
```

---

#### GET `/query/stream`
Ask a question with streaming response via SSE.

**Query Params:** `?q=your+question&top_k=5`

**Response:** `text/event-stream`
```
data: RAG retrieves
data:  relevant context
data:  at query time...
data: [DONE]
```

---

#### GET `/health`
Health check endpoint.

**Response:** `200 OK`
```json
{
  "status": "ok",
  "chroma": "connected",
  "embed_model": "loaded",
  "version": "1.0.0"
}
```

---

### 3.4 Ingest Pipeline

```
File Upload
    ↓
loader.py → reads raw text per file type
    ↓
chunker.py → splits into chunks
             (RecursiveCharacterTextSplitter)
             chunk_size=512, overlap=64
    ↓
embedder.py → BGE-Small encodes each chunk
              → 384-dim dense vector
    ↓
ChromaDB upsert:
  id:        f"{doc_id}_chunk_{i}"
  embedding: [384 floats]
  document:  chunk text
  metadata:
    doc_id, filename, chunk_index,
    ingested_at, source_path
```

### 3.5 Query Pipeline

```
User Question
    ↓
BGE-Small encodes question → 384-dim vector
    ↓
ChromaDB cosine similarity search
→ top_k=5 chunks above threshold=0.35
    ↓
Prompt Builder:
  - System prompt with instructions
  - Injected context chunks (numbered)
  - User question
    ↓
NVIDIA NIM streaming call
    ↓
SSE stream to frontend
+ source metadata returned
```

### 3.6 Prompt Template

```
System:
You are a helpful assistant answering questions based strictly on the provided context.
Always cite which source (Source 1, Source 2, etc.) you used.
If the answer is not found in the context, say "I couldn't find this in your knowledge base."
Do not make up information.

Context:
[Source 1 - notes.md, chunk 3]
{chunk_1_text}

[Source 2 - research.pdf, chunk 7]
{chunk_2_text}

...

User Question:
{question}
```

---

## 4. Frontend Specification

### 4.1 Technology

- **Framework:** React 18
- **Styling:** Tailwind CSS v3
- **Build Tool:** Vite
- **HTTP Client:** `fetch` (native)
- **Streaming:** `EventSource` (SSE)
- **State:** `useState` / `useReducer` (no Redux needed)
- **Icons:** `lucide-react`

### 4.2 Pages / Views

Only one page — `App.jsx` with two panels:

```
┌──────────────┬──────────────────────────────┐
│   Sidebar    │       Chat Window            │
│              │                              │
│ Ingested     │  [Message Bubble - User]     │
│ Files List   │  [Message Bubble - AI]       │
│              │    ↳ [Source Card x2]        │
│ [Upload      │                              │
│  Button]     │  [Input Bar + Send Button]   │
└──────────────┴──────────────────────────────┘
```

### 4.3 Component Specs

#### `ChatWindow.jsx`
- Renders list of messages (user + assistant)
- Auto-scrolls to bottom on new message
- Shows typing indicator while streaming
- Passes `onSend(question)` handler

#### `MessageBubble.jsx`
**Props:** `{ role: 'user'|'assistant', content: string, sources: Source[] }`
- User: right-aligned, accent color
- Assistant: left-aligned, neutral
- If `sources` present, renders `SourceCard` list below answer

#### `SourceCard.jsx`
**Props:** `{ filename: string, chunk_index: number, content: string, score: number }`
- Collapsible card showing filename + score badge
- Expand to show chunk preview text

#### `FileUploader.jsx`
- Drag & drop zone OR click to browse
- Accepts: `.pdf`, `.md`, `.txt`
- Shows upload progress bar
- On success: refreshes sidebar source list

#### `Sidebar.jsx`
- Lists all ingested documents from `GET /sources`
- Each item: filename, chunk count, delete button
- Refresh button at top

### 4.4 API Integration (`useChat.js`)

```javascript
// Non-streaming query
const query = async (question) => { ... }

// Streaming query via SSE
const queryStream = (question, onChunk, onDone) => {
  const source = new EventSource(`/query/stream?q=${encodeURIComponent(question)}`)
  source.onmessage = (e) => {
    if (e.data === '[DONE]') { onDone(); source.close(); return; }
    onChunk(e.data)
  }
}
```

---

## 5. Data Models

### Document
```python
class Document(BaseModel):
    doc_id: str           # uuid4
    filename: str
    source_path: str
    chunks: int
    ingested_at: datetime
    size_kb: float
```

### Chunk (stored in ChromaDB metadata)
```python
{
  "doc_id": str,
  "filename": str,
  "chunk_index": int,
  "ingested_at": str,   # ISO format
}
```

### QueryRequest
```python
class QueryRequest(BaseModel):
    question: str
    top_k: int = 5
```

### QueryResponse
```python
class QueryResponse(BaseModel):
    answer: str
    sources: list[SourceChunk]
    latency_ms: int
```

### SourceChunk
```python
class SourceChunk(BaseModel):
    doc_id: str
    filename: str
    chunk_index: int
    content: str
    score: float
```

---

## 6. Environment Variables

```bash
# Required
NVIDIA_API_KEY=nvapi-xxxxxxxxxxxx

# Optional (defaults shown)
CHROMA_PATH=./chroma_db
EMBED_MODEL=BAAI/bge-small-en-v1.5
LLM_MODEL=meta/llama-3.1-70b-instruct
LLM_BASE_URL=https://integrate.api.nvidia.com/v1
TOP_K=5
CHUNK_SIZE=512
CHUNK_OVERLAP=64
```

---

## 7. Error Handling

| Scenario | HTTP Code | Message |
|---|---|---|
| Unsupported file type | 422 | `"Only .pdf, .md, .txt supported"` |
| Empty file | 400 | `"File is empty"` |
| No results above threshold | 200 | answer = `"I couldn't find this in your knowledge base."` |
| NVIDIA API error | 502 | `"LLM service unavailable"` |
| ChromaDB error | 500 | `"Vector store error"` |

---

## 8. Performance Targets

| Metric | Target |
|---|---|
| Ingest speed | < 2s per 10-page PDF |
| Embed latency (single chunk) | < 50ms on CPU |
| Retrieval latency | < 100ms for 10k chunks |
| First token latency | < 1.5s |
| Full response (streaming) | Continuous, no buffer lag |

---

## 9. Future Enhancements (v2.0)

- [ ] Reranker with `BAAI/bge-reranker-base`
- [ ] Conversation memory (multi-turn context)
- [ ] Metadata filtering (query by tag/folder)
- [ ] Obsidian vault watcher (auto-ingest on file change)
- [ ] Export Q&A pairs to markdown
- [ ] Evaluation harness (RAGAS metrics)
