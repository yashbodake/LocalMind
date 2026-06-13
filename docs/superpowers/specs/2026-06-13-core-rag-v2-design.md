# Core RAG v2 — Design Spec

**Date:** 2026-06-13  
**Status:** Approved  
**Sub-project:** A of 3 (Core RAG v2 → UX Polish → Engineering & Advanced)

---

## 1. Overview

Four backend-driven features that make LocalMind's RAG pipeline smarter:

1. **Reranker** — two-stage retrieval for higher accuracy
2. **Conversation memory** — multi-turn context (session-only)
3. **Metadata filtering** — restrict queries to selected documents
4. **Multi-model selector** — switch LLMs at runtime

### 1.1 Non-Goals

- Persistent chat sessions across restarts (Sub-project C territory)
- Backend session management / session IDs
- New database tables or storage layers
- Vector-backed conversation history

### 1.2 Architecture

**Stateless backend, stateful frontend.** The frontend owns all session state (message history, selected model, selected documents) and sends it with each request. The backend remains stateless — no session dicts, no cleanup logic, no memory leaks.

Streaming changes from `EventSource` (GET-only) to `fetch()` + `ReadableStream` (POST with body) to support passing history, model, and doc_ids in the request body.

---

## 2. API Contract

### 2.1 POST /query (extended)

```json
{
  "question": "What is RAG?",
  "top_k": 5,
  "history": [
    {"role": "user", "content": "What is fine-tuning?"},
    {"role": "assistant", "content": "Fine-tuning modifies model weights..."}
  ],
  "model": "meta/llama-3.1-8b-instruct",
  "doc_ids": ["abc123", "def456"]
}
```

All new fields are optional:
- `history` — list of prior `{role, content}` objects. Omit for single-turn queries.
- `model` — NVIDIA NIM model string. Falls back to `config.yaml` default if omitted.
- `doc_ids` — restricts retrieval to these document IDs. Empty/null = search everything.

Response shape is unchanged from v1.

### 2.2 POST /query/stream (changed from GET to POST)

Same request body as `/query`. Response stays SSE format:
```
data: {token}
data: [DONE]
```

Frontend switches from `EventSource` to `fetch()` + `response.body.getReader()` to parse the SSE stream.

### 2.3 GET /models (new endpoint)

Lightweight endpoint returning available models from config:
```json
{
  "models": [
    "meta/llama-3.1-8b-instruct",
    "meta/llama-3.1-70b-instruct",
    "nvidia/nemotron-4-340b-instruct",
    "mistralai/mistral-7b-instruct-v0.3"
  ],
  "default": "meta/llama-3.1-8b-instruct"
}
```

### 2.4 Config additions

```yaml
retrieval:
  top_k: 5
  similarity_threshold: 0.35
  reranker:
    enabled: true
    model: BAAI/bge-reranker-base
    retrieve_k: 20      # over-fetch this many chunks before reranking
    final_k: 5           # final chunks sent to LLM after reranking

llm:
  provider: nvidia
  base_url: https://integrate.api.nvidia.com/v1
  model: meta/llama-3.1-8b-instruct
  max_tokens: 1024
  temperature: 0.2
  stream: true
  models:
    - meta/llama-3.1-8b-instruct
    - meta/llama-3.1-70b-instruct
    - nvidia/nemotron-4-340b-instruct
    - mistralai/mistral-7b-instruct-v0.3
```

---

## 3. Feature Designs

### 3.1 Reranker Pipeline

Two-stage retrieval. Existing cosine search over-fetches, then a CrossEncoder reranks.

**New file: `retrieval/reranker.py`**

- `_get_reranker()` — lazy-loads `BAAI/bge-reranker-base` via `sentence_transformers.CrossEncoder`, cached in module-level singleton
- `rerank(question: str, chunks: list[SourceChunk], final_k: int) -> list[SourceChunk]` — scores each chunk against the question using `model.predict()`, sorts by score descending, returns top `final_k`
- Reads model name from `config["retrieval"]["reranker"]["model"]`

**Changes to `retrieval/retriever.py`:**

```python
def retrieve(question, top_k=None, doc_ids=None):
    # Determine effective K for initial fetch
    reranker_cfg = config["retrieval"].get("reranker", {})
    if reranker_cfg.get("enabled"):
        fetch_k = reranker_cfg["retrieve_k"]   # e.g., 20
        final_k = reranker_cfg["final_k"]       # e.g., 5
    else:
        fetch_k = top_k or config["retrieval"]["top_k"]
        final_k = fetch_k

    # Stage 1: cosine search (over-fetch)
    results = collection.query(..., n_results=fetch_k, where=where_filter)

    # Stage 2: rerank
    if reranker_cfg.get("enabled") and len(chunks) > final_k:
        chunks = rerank(question, chunks, final_k)

    return chunks
```

- `doc_ids` filter: if provided, passes `where={"doc_id": {"$in": doc_ids}}` to ChromaDB query
- If reranker disabled, behaves exactly as v1

### 3.2 Conversation Memory

**Frontend (`ChatWindow.jsx`):**

- Existing `messages` state holds full conversation
- On each send, builds `history` from last `MAX_HISTORY_TURNS` Q&A pairs (frontend constant = 5):
  ```javascript
  const MAX_HISTORY_TURNS = 5;
  const history = messages
    .slice(-MAX_HISTORY_TURNS * 2)
    .map(m => ({ role: m.role, content: m.content }));
  ```
- Includes `history` in both `/query` and `/query/stream` request bodies
- The frontend owns this constant — the backend accepts whatever history it receives

**Backend (`llm/generator.py`):**

- `_build_messages(question, chunks, history)` — injects prior conversation between system prompt and context
- Updated prompt structure:
  ```
  System: [unchanged system instructions]

  Previous conversation:
  User: {history[0].content}
  Assistant: {history[1].content}
  ...

  Context:
  [Source 1 - notes.md, chunk 3]
  {chunk_1_text}
  ...

  User Question:
  {question}
  ```
- History items are role-labeled, not wrapped in special tokens — the LLM handles them as plain text context
- `generate()` and `stream()` both accept `history` param and pass it through

### 3.3 Metadata Filtering

**Frontend:**

- `Sidebar.jsx`: each source item gets a checkbox (checked by default)
- Header gets "Select all" / "Deselect all" toggle
- Checked `doc_ids` stored in `App.jsx` state, passed to `ChatWindow.jsx` as prop
- `ChatWindow.jsx` includes `doc_ids` in query requests
- Visual: unchecked sources dimmed/greyed in the sidebar

**Backend:**

- `retriever.py`: if `doc_ids` is non-empty, passes `where={"doc_id": {"$in": doc_ids}}` to ChromaDB `.query()`
- If `doc_ids` is empty/null → no `where` clause (search all documents)

### 3.4 Multi-Model Selector

**New component: `ModelSelector.jsx`**

- Dropdown rendered in ChatWindow header bar
- Fetches model list from `GET /models` on mount
- Selected model stored in `App.jsx` state, passed to `ChatWindow.jsx`
- Included in query request body as `model` field

**Backend:**

- `GET /models` endpoint reads `config["llm"]["models"]` and `config["llm"]["model"]` (default)
- `generator.py`: `generate()` and `stream()` accept optional `model` param. If provided, uses it instead of config default. All other LLM params (temperature, max_tokens) come from config.

---

## 4. Frontend Changes

### 4.1 fetch streaming rewrite (`hooks/useChat.js`)

`queryStream()` changes from EventSource to fetch:

```javascript
export async function queryStream(question, { history, model, doc_ids }, onChunk, onDone, onError) {
  const res = await fetch("/query/stream", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question, history, model, doc_ids }),
  });

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop(); // keep partial line
    for (const line of lines) {
      if (line.startsWith("data: ")) {
        const data = line.slice(6);
        if (data === "[DONE]") { onDone(); return; }
        onChunk(data);
      }
    }
  }
}
```

This preserves the exact SSE wire format (`data: {token}\n\n` → `data: [DONE]`) so the backend streaming code doesn't change at all.

### 4.2 Updated query function

```javascript
export async function query(question, { history, model, doc_ids }) {
  const res = await fetch("/query", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question, history, model, doc_ids }),
  });
  return res.json();
}
```

### 4.3 Component tree changes

```
App.jsx
├── state: selectedModel, selectedDocIds
├── Sidebar.jsx
│   ├── sources with checkboxes
│   └── FileUploader.jsx
└── ChatWindow.jsx
    ├── ModelSelector.jsx (new)
    ├── MessageBubble.jsx
    │   └── SourceCard.jsx
    └── Input bar
```

### 4.4 Pydantic schema changes (`models/schemas.py`)

```python
class HistoryMessage(BaseModel):
    role: str   # "user" | "assistant"
    content: str

class QueryRequest(BaseModel):
    question: str
    top_k: int = 5
    history: list[HistoryMessage] = []
    model: Optional[str] = None
    doc_ids: Optional[list[str]] = None

class ModelsResponse(BaseModel):
    models: list[str]
    default: str
```

---

## 5. Error Handling

| Scenario | HTTP Code | Behavior |
|---|---|---|
| Invalid model string | 502 | "LLM service unavailable" (NVIDIA returns 404) |
| All doc_ids filtered out | 200 | Empty sources list, fallback answer from LLM |
| Reranker model fails to load | 500 | Log error, fall back to unranked results |
| History malformed | 422 | FastAPI validation error |

---

## 6. Testing Strategy

Manual test checklist (no automated tests in this sub-project — that's Sub-project C):

- [ ] Reranker: query returns more relevant chunks than v1 (compare top-5 before/after)
- [ ] Memory: ask follow-up question ("tell me more about that"), verify it references prior context
- [ ] Memory: conversation longer than max_turns drops oldest turns correctly
- [ ] Filtering: uncheck a doc, ask a question about it → no results from that doc
- [ ] Filtering: uncheck all docs → returns fallback message
- [ ] Model selector: switch to different model, verify response style changes
- [ ] Streaming: fetch-based streaming works end-to-end
- [ ] Backward compat: omit all new fields → behaves exactly like v1

---

## 7. Files Changed

### New files
| File | Purpose |
|---|---|
| `backend/retrieval/reranker.py` | CrossEncoder reranker |
| `frontend/src/components/ModelSelector.jsx` | Model dropdown |

### Modified files
| File | Changes |
|---|---|
| `backend/config.yaml` | Add `reranker`, `models`, config sections |
| `backend/models/schemas.py` | Add `HistoryMessage`, `ModelsResponse`, extend `QueryRequest` |
| `backend/retrieval/retriever.py` | Add `doc_ids` filter, two-stage rerank flow |
| `backend/llm/generator.py` | Accept `history`, `model` params; update prompt builder |
| `backend/main.py` | `POST /query/stream` (was GET), `GET /models`, pass new params through |
| `frontend/src/hooks/useChat.js` | `queryStream` → fetch streaming, add `query` params, add `getModels` |
| `frontend/src/components/ChatWindow.jsx` | Build history, pass model/doc_ids, render `ModelSelector` |
| `frontend/src/components/Sidebar.jsx` | Add checkboxes for doc filtering |
| `frontend/src/App.jsx` | State for `selectedModel`, `selectedDocIds` |
| `AGENT.md` | Update API table: change `/query/stream` to POST, add `GET /models` |
