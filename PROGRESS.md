# PROGRESS.md — LocalMind Development Tracker

> Update this file as you complete tasks. Check off boxes, add notes, log blockers.

**Started:** ___________  
**Target Completion:** ___________  
**Current Phase:** Phase 1 — Backend Core

---

## 📊 Overall Progress

```
Phase 1 — Backend Core        [ 0/6  ] ░░░░░░░░░░  0%
Phase 2 — Retrieval + LLM     [ 0/5  ] ░░░░░░░░░░  0%
Phase 3 — Frontend            [ 0/6  ] ░░░░░░░░░░  0%
Phase 4 — Polish & Ship       [ 0/5  ] ░░░░░░░░░░  0%

Total                         [ 0/22 ] ░░░░░░░░░░  0%
```

---

## ✅ Phase 1 — Backend Core

**Goal:** Ingest pipeline working end-to-end. Files go in, chunks land in ChromaDB.

### Setup
- [ ] **1.1** Create `backend/` folder structure
- [ ] **1.2** Create `requirements.txt` with pinned deps
- [ ] **1.3** Create `.env.example` and `config.yaml`
- [ ] **1.4** Bootstrap `main.py` with FastAPI app + CORS + `/health` endpoint

### Ingest Pipeline
- [ ] **1.5** `ingest/loader.py` — implement `load_file(path) -> str`
  - [ ] `.txt` support
  - [ ] `.md` support
  - [ ] `.pdf` support via `pypdf`
  - [ ] Unsupported type raises `ValueError`
- [ ] **1.6** `ingest/chunker.py` — implement `chunk_text(text) -> list[str]`
  - [ ] Uses `RecursiveCharacterTextSplitter`
  - [ ] Reads `chunk_size` and `chunk_overlap` from config
- [ ] **1.7** `ingest/embedder.py` — implement `embed_and_store(chunks, metadata)`
  - [ ] Loads `bge-small-en-v1.5` model
  - [ ] Encodes with `normalize_embeddings=True`
  - [ ] Upserts to ChromaDB with correct IDs and metadata
- [ ] **1.8** `models/schemas.py` — all Pydantic models defined
- [ ] **1.9** `POST /ingest` endpoint wired up and tested manually
- [ ] **1.10** `GET /sources` endpoint returning correct list
- [ ] **1.11** `DELETE /sources/{doc_id}` endpoint working

**Phase 1 Notes:**
```
(add notes here as you build)
```

**Phase 1 Blockers:**
```
(log any blockers here)
```

---

## ✅ Phase 2 — Retrieval + LLM

**Goal:** `/query` endpoint returns a cited answer from ingested documents.

### Retrieval
- [ ] **2.1** `retrieval/retriever.py` — implement `retrieve(question, top_k) -> list[SourceChunk]`
  - [ ] Embeds question with same BGE model
  - [ ] Queries ChromaDB with cosine similarity
  - [ ] Filters by similarity threshold (0.35)
  - [ ] Returns list of `SourceChunk` objects

### LLM Integration
- [ ] **2.2** `llm/generator.py` — NVIDIA NIM client setup
  - [ ] Reads API key from env
  - [ ] OpenAI SDK pointed at NVIDIA base URL
- [ ] **2.3** `llm/generator.py` — implement `generate(question, chunks) -> str`
  - [ ] Builds prompt from template in SPEC.md §3.6
  - [ ] Non-streaming call working
- [ ] **2.4** `llm/generator.py` — implement `stream(question, chunks) -> AsyncGenerator`
  - [ ] Streaming tokens via async generator
- [ ] **2.5** `POST /query` endpoint wired up (non-streaming)
- [ ] **2.6** `GET /query/stream` endpoint wired up (SSE)

**Manual Test Checklist (Phase 2 complete when all pass):**
- [ ] Upload a `.md` file, ask a question about it, get a cited answer
- [ ] Upload a `.pdf` file, ask a question, get a cited answer
- [ ] Ask a question with no relevant docs → get fallback message
- [ ] Streaming endpoint returns tokens progressively

**Phase 2 Notes:**
```
(add notes here as you build)
```

**Phase 2 Blockers:**
```
(log any blockers here)
```

---

## ✅ Phase 3 — Frontend

**Goal:** React UI that can upload files and chat with the knowledge base.

### Setup
- [ ] **3.1** Scaffold Vite + React + Tailwind project
- [ ] **3.2** Configure Vite proxy to `/api` → `localhost:8000`
- [ ] **3.3** Install `lucide-react`

### Components
- [ ] **3.4** `hooks/useChat.js` — all API calls implemented
  - [ ] `uploadFiles(files)` → POST /ingest
  - [ ] `getSources()` → GET /sources
  - [ ] `deleteSource(id)` → DELETE /sources/{id}
  - [ ] `queryStream(q, onChunk, onDone)` → GET /query/stream
- [ ] **3.5** `Sidebar.jsx` — file list + upload button
- [ ] **3.6** `FileUploader.jsx` — drag & drop working
- [ ] **3.7** `ChatWindow.jsx` — message list + input bar
- [ ] **3.8** `MessageBubble.jsx` — user/assistant styling
- [ ] **3.9** `SourceCard.jsx` — collapsible source preview
- [ ] **3.10** `App.jsx` — two-panel layout assembled

**Phase 3 Notes:**
```
(add notes here as you build)
```

**Phase 3 Blockers:**
```
(log any blockers here)
```

---

## ✅ Phase 4 — Polish & Ship

**Goal:** Project is demo-ready and GitHub-presentable.

- [ ] **4.1** Error states in UI (upload fail, query fail, empty state)
- [ ] **4.2** Loading indicators (upload progress, typing indicator during stream)
- [ ] **4.3** `docker-compose.yml` — one command to run backend + frontend
- [ ] **4.4** `README.md` — architecture diagram, demo GIF, setup instructions
- [ ] **4.5** Final manual end-to-end test pass

**Phase 4 Notes:**
```
(add notes here as you build)
```

---

## 🐛 Bug Log

| # | Description | Status | Fixed in |
|---|---|---|---|
| - | - | - | - |

---

## 📝 Decision Log

> Record any architectural decisions made during development

| Date | Decision | Reason |
|---|---|---|
| - | Started with `bge-small-en-v1.5` (384 dims) | Lightweight, fast on CPU |
| - | ChromaDB over Qdrant | Simpler setup, no server needed |
| - | NVIDIA NIM over OpenAI | Free tier available |

---

## 🔗 Useful Commands

```bash
# Start backend
cd backend && uvicorn main:app --reload --port 8000

# Start frontend
cd frontend && npm run dev

# Test ingest endpoint
curl -X POST http://localhost:8000/ingest \
  -F "files=@test.md"

# Test query endpoint
curl -X POST http://localhost:8000/query \
  -H "Content-Type: application/json" \
  -d '{"question": "What is RAG?"}'

# List sources
curl http://localhost:8000/sources

# Health check
curl http://localhost:8000/health

# Wipe ChromaDB (fresh start)
rm -rf backend/chroma_db
```
