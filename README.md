# LocalMind

A self-hosted RAG (Retrieval-Augmented Generation) system. Upload your documents, ask questions, get cited answers.

## Architecture

```
React Frontend (Vite)          FastAPI Backend
┌──────────────────┐           ┌────────────────────────────────┐
│  Sidebar         │           │  POST /ingest   → Loader       │
│  ChatWindow      │  HTTP/SSE │  GET  /sources  → ChromaDB     │
│  FileUploader    │◄─────────►│  DEL  /sources  → ChromaDB     │
│                  │           │  POST /query    → Retriever     │
│  useChat.js      │           │  GET  /query/stream → LLM (SSE)│
└──────────────────┘           └──────┬─────────────────────────┘
                                      │
                               ┌──────▼──────┐
                               │   ChromaDB   │
                               │ (Persistent) │
                               └─────────────┘
```

### Stack

| Layer | Tech |
|---|---|
| Frontend | React 18, Tailwind CSS v3, Vite |
| Backend | FastAPI, Python 3.11+ |
| Embeddings | BAAI/bge-small-en-v1.5 (384-dim) |
| Vector DB | ChromaDB (persistent, cosine similarity) |
| LLM | NVIDIA NIM — meta/llama-3.1-70b-instruct |
| File Parsing | pypdf (PDF), native (MD/TXT) |

## Quick Start

### Prerequisites

- Python 3.11+
- Node.js 18+
- NVIDIA API key ([get one here](https://build.nvidia.com/))

### 1. Clone and configure

```bash
cp .env.example .env
# Edit .env and add your NVIDIA_API_KEY
```

### 2. Start backend

```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

### 3. Start frontend

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:5173

### Docker (alternative)

```bash
docker-compose up --build
```

## API Endpoints

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/ingest` | Upload files (.pdf, .md, .txt) |
| `GET` | `/sources` | List ingested documents |
| `DELETE` | `/sources/{doc_id}` | Remove a document |
| `POST` | `/query` | Ask a question (non-streaming) |
| `GET` | `/query/stream` | Ask a question (SSE stream) |
| `GET` | `/health` | Health check |

## Usage

```bash
# Upload a file
curl -X POST http://localhost:8000/ingest -F "files=@notes.md"

# Ask a question
curl -X POST http://localhost:8000/query \
  -H "Content-Type: application/json" \
  -d '{"question": "What is RAG?"}'

# Stream an answer
curl http://localhost:8000/query/stream?q=What+is+RAG%3F

# List sources
curl http://localhost:8000/sources

# Health check
curl http://localhost:8000/health
```

## Configuration

All tunable parameters live in `backend/config.yaml`:

| Setting | Default | Description |
|---|---|---|
| `chunking.chunk_size` | 512 | Characters per chunk |
| `chunking.chunk_overlap` | 64 | Overlap between chunks |
| `retrieval.top_k` | 5 | Number of chunks to retrieve |
| `retrieval.similarity_threshold` | 0.35 | Minimum similarity score |
| `llm.max_tokens` | 1024 | Max response tokens |
| `llm.temperature` | 0.2 | LLM sampling temperature |

## Project Structure

```
backend/
  main.py              FastAPI app + routes
  config.yaml          All configuration
  requirements.txt     Python dependencies
  ingest/
    loader.py          File → raw text
    chunker.py         Text → chunks
    embedder.py        Chunks → embeddings → ChromaDB
  retrieval/
    retriever.py       Query → vector search → top-k chunks
  llm/
    generator.py       Chunks + question → NVIDIA NIM → answer
  models/
    schemas.py         Pydantic request/response models

frontend/
  src/
    App.jsx            Two-panel layout
    hooks/useChat.js   All API calls
    components/
      Sidebar.jsx      File list + uploader
      FileUploader.jsx Drag & drop upload
      ChatWindow.jsx   Messages + input
      MessageBubble.jsx User/assistant bubbles
      SourceCard.jsx   Collapsible source preview
```

## Troubleshooting

- **ChromaDB dimension mismatch**: Delete `backend/chroma_db/` and re-ingest
- **NVIDIA rate limits (429)**: Free tier has token limits, wait and retry
- **Empty PDF text**: Scanned PDFs won't extract text, use text-based PDFs
- **sqlite3 too old**: ChromaDB requires sqlite3 >= 3.35.0 (use Python 3.11+)
