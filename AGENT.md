# AGENT.md — AI Assistant Guide for LocalMind

> This file tells AI coding assistants (Cursor, GitHub Copilot, Claude Code, etc.)
> everything they need to know about this project to give accurate, consistent help.

---

## 🧠 Project Summary

LocalMind is a **RAG (Retrieval-Augmented Generation)** system. Users upload documents,
they get chunked + embedded into ChromaDB, and questions are answered by retrieving
relevant chunks and passing them to an LLM (NVIDIA NIM).

**Not** a SaaS product. **Not** multi-user. A personal, local knowledge base tool.

---

## 📁 Codebase Map

```
backend/
  main.py          → FastAPI app, CORS, router registration
  config.yaml      → All tunable parameters (chunk size, model names, etc.)
  ingest/
    loader.py      → File → raw text (handles PDF, MD, TXT)
    chunker.py     → Raw text → list of chunk strings
    embedder.py    → Chunks → embeddings → ChromaDB upsert
  retrieval/
    retriever.py   → Query → ChromaDB cosine search → top-k chunks
  llm/
    generator.py   → Chunks + question → NVIDIA NIM → streamed answer
  models/
    schemas.py     → All Pydantic models (request/response shapes)

frontend/
  src/
    components/    → React components (see SPEC.md §4.3 for details)
    hooks/
      useChat.js   → All API calls live here, not in components
    App.jsx        → Layout only. No business logic here.
```

---

## ⚙️ Key Technical Decisions

### Embeddings
- Model: `BAAI/bge-small-en-v1.5`
- Library: `sentence-transformers`
- Output: **384-dim dense vectors**
- Device: CPU by default (check `config.yaml`)
- Do NOT switch to BGE-M3 unless explicitly asked — too heavy

```python
# CORRECT way to embed
from sentence_transformers import SentenceTransformer
model = SentenceTransformer('BAAI/bge-small-en-v1.5')
embedding = model.encode(text, normalize_embeddings=True)
# normalize_embeddings=True is required for cosine similarity
```

### Vector Store
- ChromaDB with `PersistentClient`
- Collection name: `localmind` (from config)
- Distance metric: **cosine** (set in collection metadata)
- IDs format: `{doc_id}_chunk_{index}`

```python
# CORRECT ChromaDB setup
client = chromadb.PersistentClient(path=config["chroma"]["path"])
collection = client.get_or_create_collection(
    name="localmind",
    metadata={"hnsw:space": "cosine"}
)
```

### LLM
- Provider: NVIDIA NIM via `openai` SDK
- Base URL: `https://integrate.api.nvidia.com/v1`
- Model: `meta/llama-3.1-70b-instruct`
- Always stream responses (SSE)
- API key from `NVIDIA_API_KEY` env var

```python
# CORRECT NVIDIA NIM client setup
from openai import OpenAI
client = OpenAI(
    base_url="https://integrate.api.nvidia.com/v1",
    api_key=os.getenv("NVIDIA_API_KEY")
)
```

### Chunking
- Strategy: `RecursiveCharacterTextSplitter` from `langchain_text_splitters`
- `chunk_size=512`, `chunk_overlap=64`
- Do NOT use fixed-size character splitting — use recursive

### CORS
- Backend allows `http://localhost:5173` (Vite default)
- Do not open CORS to `*` in production

---

## 🚫 What NOT To Do

- Do NOT use `langchain` full library — only `langchain_text_splitters`
- Do NOT use `faiss` — we use ChromaDB
- Do NOT store embeddings in SQLite or files — ChromaDB only
- Do NOT use `requests` for async routes — use `httpx` if needed
- Do NOT put API call logic inside React components — use `useChat.js`
- Do NOT use Redux — `useState`/`useReducer` is sufficient
- Do NOT use `localStorage` for chat history — keep in React state only
- Do NOT hardcode API keys anywhere in code

---

## 🔌 API Contract (Backend ↔ Frontend)

The frontend and backend communicate via these endpoints only.
Do not add new endpoints without updating `docs/API.md`.

| Method | Path | Purpose |
|---|---|---|
| POST | `/ingest` | Upload files |
| GET | `/sources` | List documents |
| DELETE | `/sources/{doc_id}` | Delete document |
| POST | `/query` | Ask question (non-stream) |
| GET | `/query/stream` | Ask question (SSE stream) |
| GET | `/health` | Health check |

Full request/response shapes are in `docs/SPEC.md` §3.3.

---

## 🧪 Testing Conventions

- Backend tests: `pytest` in `backend/tests/`
- Test files: `test_{module_name}.py`
- Use `pytest-asyncio` for async route tests
- Mock ChromaDB with `chromadb.EphemeralClient()` in tests
- Frontend: no tests required in v1.0

---

## 📦 Dependencies

### Backend (`requirements.txt`)
```
fastapi==0.110.0
uvicorn[standard]==0.27.0
sentence-transformers==2.7.0
chromadb==0.5.0
openai==1.30.0
pypdf==4.2.0
langchain-text-splitters==0.0.1
python-dotenv==1.0.1
pyyaml==6.0.1
python-multipart==0.0.9
```

### Frontend (`package.json` key deps)
```json
{
  "react": "^18.0.0",
  "tailwindcss": "^3.0.0",
  "lucide-react": "latest",
  "vite": "^5.0.0"
}
```

---

## 🔄 Streaming Pattern

When implementing or modifying streaming:

**Backend (FastAPI SSE):**
```python
from fastapi.responses import StreamingResponse

async def stream_generator(question: str, chunks: list):
    async for token in generator.stream(question, chunks):
        yield f"data: {token}\n\n"
    yield "data: [DONE]\n\n"

return StreamingResponse(stream_generator(...), media_type="text/event-stream")
```

**Frontend (EventSource):**
```javascript
const source = new EventSource(`/query/stream?q=${encodeURIComponent(q)}`)
source.onmessage = (e) => {
  if (e.data === '[DONE]') { source.close(); return; }
  setAnswer(prev => prev + e.data)
}
source.onerror = () => source.close()
```

---

## 📝 Code Style

- Python: follow `black` formatting, type hints on all functions
- React: functional components only, no class components
- Tailwind: utility classes only, no custom CSS files
- Comments: explain WHY not WHAT
- All config values come from `config.yaml` or `.env`, never hardcoded

---

## 🐛 Common Pitfalls

1. **ChromaDB dimension mismatch** — If you change the embedding model, delete `./chroma_db` folder and re-ingest. Chroma locks dimension on first insert.

2. **NVIDIA rate limits** — Free tier has token limits. Add `time.sleep(0.5)` between batch embedding calls if hitting 429s.

3. **PDF extraction** — `pypdf` may return empty text for scanned PDFs. Log a warning and skip the file rather than crashing.

4. **SSE and CORS** — `EventSource` doesn't support custom headers. NVIDIA API key must stay on the backend; never expose it to the frontend.

5. **normalize_embeddings** — Always pass `normalize_embeddings=True` to `model.encode()`. Without it, cosine similarity scores will be wrong.

---

## 📖 Reference Docs

- ChromaDB: https://docs.trychroma.com
- BGE Models: https://huggingface.co/BAAI/bge-small-en-v1.5
- NVIDIA NIM: https://docs.api.nvidia.com
- FastAPI: https://fastapi.tiangolo.com
- sentence-transformers: https://www.sbert.net
