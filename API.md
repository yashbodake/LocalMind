# API Reference — LocalMind Backend

**Base URL:** `http://localhost:8000`  
**Version:** v1.0  

---

## POST `/ingest`

Upload and ingest files into the knowledge base.

**Content-Type:** `multipart/form-data`

**Parameters:**

| Field | Type | Required | Description |
|---|---|---|---|
| `files` | `File[]` | Yes | One or more files (.pdf, .md, .txt) |

**Success Response `200`:**
```json
{
  "status": "success",
  "ingested": [
    {
      "filename": "notes.md",
      "chunks": 14,
      "doc_id": "f47ac10b-58cc-4372-a567-0e02b2c3d479"
    }
  ]
}
```

**Error Responses:**

`422 Unprocessable Entity` — Unsupported file type
```json
{ "detail": "Unsupported file type: .docx. Only .pdf, .md, .txt allowed." }
```

`400 Bad Request` — Empty file
```json
{ "detail": "File 'notes.md' is empty." }
```

---

## GET `/sources`

List all ingested documents.

**Success Response `200`:**
```json
{
  "sources": [
    {
      "doc_id": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
      "filename": "notes.md",
      "chunks": 14,
      "ingested_at": "2025-06-01T10:30:00Z",
      "size_kb": 12.4
    },
    {
      "doc_id": "a1b2c3d4-1234-5678-abcd-ef0123456789",
      "filename": "research.pdf",
      "chunks": 42,
      "ingested_at": "2025-06-02T09:15:00Z",
      "size_kb": 234.1
    }
  ]
}
```

---

## DELETE `/sources/{doc_id}`

Remove a document and all its chunks from the vector store.

**Path Parameters:**

| Param | Type | Description |
|---|---|---|
| `doc_id` | `string` | UUID of the document to delete |

**Success Response `200`:**
```json
{
  "status": "deleted",
  "doc_id": "f47ac10b-58cc-4372-a567-0e02b2c3d479"
}
```

**Error Response `404`:**
```json
{ "detail": "Document not found." }
```

---

## POST `/query`

Ask a question (non-streaming). Returns full answer + sources.

**Content-Type:** `application/json`

**Request Body:**
```json
{
  "question": "What is the difference between RAG and fine-tuning?",
  "top_k": 5
}
```

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `question` | `string` | Yes | — | Natural language question |
| `top_k` | `int` | No | `5` | Number of chunks to retrieve |

**Success Response `200`:**
```json
{
  "answer": "RAG (Retrieval-Augmented Generation) retrieves relevant context at query time from an external knowledge base, while fine-tuning bakes knowledge into model weights... [Source 1]",
  "sources": [
    {
      "doc_id": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
      "filename": "notes.md",
      "chunk_index": 3,
      "content": "RAG differs from fine-tuning in that it doesn't modify model weights...",
      "score": 0.87
    }
  ],
  "latency_ms": 420
}
```

**No Results Response `200`:**
```json
{
  "answer": "I couldn't find this in your knowledge base.",
  "sources": [],
  "latency_ms": 85
}
```

**Error Response `502`:**
```json
{ "detail": "LLM service unavailable. Check your NVIDIA_API_KEY." }
```

---

## GET `/query/stream`

Ask a question with Server-Sent Events (SSE) streaming response.

**Query Parameters:**

| Param | Type | Required | Default | Description |
|---|---|---|---|---|
| `q` | `string` | Yes | — | URL-encoded question |
| `top_k` | `int` | No | `5` | Number of chunks to retrieve |

**Example Request:**
```
GET /query/stream?q=What%20is%20RAG%3F&top_k=5
```

**Response Headers:**
```
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive
```

**SSE Stream:**
```
data: RAG stands for

data:  Retrieval-Augmented

data:  Generation...

data: [DONE]
```

**Frontend Usage:**
```javascript
const source = new EventSource(
  `/query/stream?q=${encodeURIComponent(question)}&top_k=5`
)
source.onmessage = (e) => {
  if (e.data === '[DONE]') { source.close(); return; }
  setAnswer(prev => prev + e.data)
}
source.onerror = () => source.close()
```

> **Note:** Sources metadata is returned as the final `data` event before `[DONE]`:
> ```
> data: {"sources": [...]}
> data: [DONE]
> ```

---

## GET `/health`

Health check — verify all systems operational.

**Success Response `200`:**
```json
{
  "status": "ok",
  "chroma": "connected",
  "embed_model": "loaded",
  "llm_provider": "nvidia",
  "version": "1.0.0"
}
```

**Degraded Response `200`:**
```json
{
  "status": "degraded",
  "chroma": "connected",
  "embed_model": "loaded",
  "llm_provider": "unavailable",
  "version": "1.0.0"
}
```

---

## Error Code Summary

| Code | Meaning |
|---|---|
| `200` | Success |
| `400` | Bad request (empty file, invalid input) |
| `404` | Resource not found |
| `422` | Validation error (wrong file type, missing field) |
| `500` | Internal server error (ChromaDB, embedding) |
| `502` | Bad gateway (NVIDIA NIM unavailable) |
