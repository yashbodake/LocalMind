# C2 — Answer Quality & Formatting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade answer formatting with syntax highlighting, LaTeX rendering, styled tables, clickable citations, follow-up suggestions, and a richer system prompt.

**Architecture:** Backend changes extract a shared LLM client, add followup generation, and persist followups to SQLite. Frontend changes add react-syntax-highlighter, remark-math/rehype-katex, a paragraph-level citation parser, and follow-up suggestion pills.

**Tech Stack:** FastAPI, SQLite, OpenAI-compatible API, React 19, react-markdown v10, react-syntax-highlighter, remark-math, rehype-katex

---

### Task 1: Create shared LLM client module

**Files:**
- Create: `backend/llm/client.py`

- [ ] **Step 1: Create `backend/llm/client.py`**

```python
import os

import yaml
from openai import OpenAI

_CONFIG_PATH = "config.yaml"
_client: OpenAI | None = None


def load_config() -> dict:
    with open(_CONFIG_PATH, "r") as f:
        return yaml.safe_load(f)


def get_client() -> OpenAI:
    global _client
    if _client is None:
        config = load_config()
        _client = OpenAI(
            base_url=config["llm"]["base_url"],
            api_key=os.getenv("NVIDIA_API_KEY"),
        )
    return _client
```

- [ ] **Step 2: Verify import works**

Run: `cd backend && python -c "from llm.client import get_client, load_config; print('OK')"`  
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add backend/llm/client.py
git commit -m "feat: extract shared LLM client to llm/client.py"
```

---

### Task 2: Refactor generator.py — use shared client + new system prompt

**Files:**
- Modify: `backend/llm/generator.py`

- [ ] **Step 1: Replace imports and private functions**

At the top of `backend/llm/generator.py`, replace lines 1-38 (imports, `_CONFIG_PATH`, `SYSTEM_PROMPT`, `_client`, `_load_config`, `_get_client`) with:

```python
import asyncio
import logging
from collections.abc import AsyncGenerator

from models.schemas import SourceChunk, HistoryMessage
from llm.client import get_client, load_config

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = (
    "You are a helpful assistant answering questions based strictly on the provided context.\n\n"
    "Format your response using markdown:\n"
    "- Start with a **Brief Answer** (1-2 sentences)\n"
    "- Use ## headings for distinct topics\n"
    "- Use bullet points for lists and steps\n"
    "- Use **bold** for key terms and important concepts\n"
    "- Use tables for comparisons or structured data\n"
    "- Use `inline code` for technical terms and ```code blocks``` for code\n"
    "- Use $...$ for inline math and $$...$$ for block math\n"
    "- Cite sources inline as [1], [2], etc.\n\n"
    "If the answer is not found in the context, say \"I couldn't find this in your knowledge base.\"\n"
    "Do not make up information."
)
```

- [ ] **Step 2: Replace all `_get_client()` calls with `get_client()` and `_load_config()` with `load_config()`**

In the `generate()` function (around line 90-91):
```python
    client = get_client()
    config = load_config()
```

In the `stream()` function (around line 119-120):
```python
    client = get_client()
    config = load_config()
```

- [ ] **Step 3: Verify generator imports**

Run: `cd backend && python -c "from llm.generator import generate, stream, SYSTEM_PROMPT; print(len(SYSTEM_PROMPT))"`  
Expected: A number around 500+

- [ ] **Step 4: Commit**

```bash
git add backend/llm/generator.py
git commit -m "refactor: generator.py uses shared llm/client.py + enriched system prompt"
```

---

### Task 3: Refactor title_generator.py — use shared client

**Files:**
- Modify: `backend/llm/title_generator.py`

- [ ] **Step 1: Read current title_generator.py**

Run: Read the file to see current imports.

- [ ] **Step 2: Replace private imports with shared client**

Replace any `_get_client` / `_load_config` imports from generator with:

```python
from llm.client import get_client, load_config
```

Replace all `_get_client()` calls with `get_client()` and `_load_config()` with `load_config()`.

- [ ] **Step 3: Verify import**

Run: `cd backend && python -c "from llm.title_generator import generate_title; print('OK')"`  
Expected: `OK`

- [ ] **Step 4: Commit**

```bash
git add backend/llm/title_generator.py
git commit -m "refactor: title_generator.py uses shared llm/client.py"
```

---

### Task 4: Create followup_generator.py

**Files:**
- Create: `backend/llm/followup_generator.py`

- [ ] **Step 1: Create the file**

```python
import logging

from llm.client import get_client, load_config

logger = logging.getLogger(__name__)


def generate_followups(question: str, answer: str, model: str | None = None) -> list[str]:
    try:
        client = get_client()
        config = load_config()
        use_model = model or config["llm"]["model"]

        response = client.chat.completions.create(
            model=use_model,
            messages=[
                {
                    "role": "system",
                    "content": "Based on this Q&A, suggest 3 concise follow-up questions. Output one per line, no numbering, no quotes.",
                },
                {
                    "role": "user",
                    "content": f"Q: {question}\nA: {answer[:1000]}",
                },
            ],
            max_tokens=100,
            temperature=0.5,
            stream=False,
        )

        text = response.choices[0].message.content.strip()
        return [q.strip() for q in text.split("\n") if q.strip()][:3]
    except Exception as e:
        logger.warning("Follow-up generation failed: %s", e)
        return []
```

- [ ] **Step 2: Verify import**

Run: `cd backend && python -c "from llm.followup_generator import generate_followups; print('OK')"`  
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add backend/llm/followup_generator.py
git commit -m "feat: add follow-up question generator"
```

---

### Task 5: Database — add followups column + update_message_followups

**Files:**
- Modify: `backend/database.py`

- [ ] **Step 1: Read current database.py to find the messages CREATE TABLE and function locations**

- [ ] **Step 2: Add followups column to schema**

In the `init_db()` function, find the `CREATE TABLE IF NOT EXISTS messages` statement and add `followups TEXT DEFAULT NULL` as the last column before the closing `)`.

- [ ] **Step 3: Add migration for existing databases**

In `init_db()`, after the CREATE TABLE statements, add:

```python
    try:
        cursor.execute("ALTER TABLE messages ADD COLUMN followups TEXT DEFAULT NULL")
    except Exception:
        pass
```

- [ ] **Step 4: Add followups to get_session message response**

In the function that returns session messages (the one that maps DB rows to message dicts), add:

```python
            "followups": json.loads(row["followups"]) if row["followups"] else None,
```

This goes alongside the existing fields like `"sources"`, `"latency_ms"`, etc.

- [ ] **Step 5: Add `update_message_followups` function**

Add a new function at the end of the file:

```python
def update_message_followups(message_id: str, followups: list[str]) -> bool:
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute(
        "UPDATE messages SET followups = ? WHERE id = ?",
        (json.dumps(followups), message_id),
    )
    conn.commit()
    return cursor.rowcount > 0
```

- [ ] **Step 6: Verify database functions**

Run: `cd backend && python -c "from database import update_message_followups; print('OK')"`  
Expected: `OK`

- [ ] **Step 7: Commit**

```bash
git add backend/database.py
git commit -m "feat: add followups column to messages table + update function"
```

---

### Task 6: Update routes/sessions.py — async followups + title

**Files:**
- Modify: `backend/routes/sessions.py`

- [ ] **Step 1: Update imports**

At the top of the file, replace the import block with:

```python
import asyncio
import logging

from fastapi import APIRouter, HTTPException

from database import (
    create_session as db_create_session,
    get_sessions as db_get_sessions,
    get_session as db_get_session,
    update_session as db_update_session,
    delete_session as db_delete_session,
    save_message as db_save_message,
    get_message_count,
    update_message_followups as db_update_message_followups,
)
from models.session_schemas import SessionCreate, SessionUpdate, MessageCreate
from llm.title_generator import generate_title
from llm.followup_generator import generate_followups
```

- [ ] **Step 2: Rewrite the `save_message` endpoint**

Replace the entire `save_message` function with:

```python
@router.post("/{session_id}/messages")
async def save_message(session_id: str, payload: MessageCreate):
    result = db_save_message(
        session_id,
        role=payload.role,
        content=payload.content,
        sources=payload.sources,
        latency_ms=payload.latency_ms,
        model=payload.model,
    )
    if not result:
        raise HTTPException(status_code=404, detail="Session not found")

    auto_title = None
    followups = None

    if payload.role == "assistant":
        session = db_get_session(session_id)

        last_user_msg = next(
            (m for m in reversed(session["messages"]) if m["role"] == "user"), None
        )
        if last_user_msg:
            followups = await asyncio.to_thread(
                generate_followups,
                last_user_msg["content"],
                payload.content,
                payload.model,
            )

        if session and session["title"] == "New Chat":
            user_msgs = [m for m in session["messages"] if m["role"] == "user"]
            asst_msgs = [m for m in session["messages"] if m["role"] == "assistant"]
            if len(user_msgs) == 1 and len(asst_msgs) == 1:
                title = await asyncio.to_thread(
                    generate_title,
                    user_msgs[0]["content"],
                    payload.content,
                    payload.model,
                )
                if title:
                    db_update_session(session_id, title=title)
                    auto_title = title

    if followups:
        db_update_message_followups(result["id"], followups)
        result["followups"] = followups

    if auto_title:
        result["auto_title"] = auto_title

    return result
```

- [ ] **Step 3: Verify backend starts**

Run: `cd backend && python -c "from routes.sessions import router; print('OK')"`  
Expected: `OK`

- [ ] **Step 4: Commit**

```bash
git add backend/routes/sessions.py
git commit -m "feat: wire async followup generation + title in session save endpoint"
```

---

### Task 7: Install frontend dependencies

**Files:**
- Modify: `frontend/package.json`

- [ ] **Step 1: Install packages**

Run:
```bash
cd frontend && npm install --legacy-peer-deps react-syntax-highlighter remark-math rehype-katex katex
```

- [ ] **Step 2: Verify installed**

Run: `cd frontend && node -e "require('react-syntax-highlighter'); require('remark-math'); require('rehype-katex'); console.log('OK')"`  
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add frontend/package.json frontend/package-lock.json
git commit -m "deps: add react-syntax-highlighter, remark-math, rehype-katex, katex"
```

---

### Task 8: Create CitationBadge.jsx

**Files:**
- Create: `frontend/src/components/CitationBadge.jsx`

- [ ] **Step 1: Create the file**

```jsx
export default function CitationBadge({ index, sources }) {
  if (index > sources.length) return <span className="text-fg-muted">[{index}]</span>;
  return (
    <sup>
      <button
        onClick={() => {
          const card = document.getElementById(`source-${index}`);
          if (card) {
            card.scrollIntoView({ behavior: "smooth", block: "center" });
            card.classList.add("ring-2", "ring-accent");
            setTimeout(() => card.classList.remove("ring-2", "ring-accent"), 2000);
          }
        }}
        className="font-mono text-accent text-[9px] font-semibold border border-accent/25 px-1 py-px rounded ml-0.5 cursor-pointer hover:bg-accent/10 align-super"
        aria-label={`Jump to source ${index}`}
      >
        [{index}]
      </button>
    </sup>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/CitationBadge.jsx
git commit -m "feat: add CitationBadge component for clickable source links"
```

---

### Task 9: Create FollowUpSuggestions.jsx

**Files:**
- Create: `frontend/src/components/FollowUpSuggestions.jsx`

- [ ] **Step 1: Create the file**

```jsx
export default function FollowUpSuggestions({ suggestions, onSelect }) {
  if (!suggestions || suggestions.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2 mt-3">
      {suggestions.map((q, i) => (
        <button
          key={i}
          onClick={() => onSelect(q)}
          className="px-3 py-1.5 text-xs font-sans text-fg-secondary border border-line rounded-lg hover:border-accent/30 hover:text-accent transition-colors"
        >
          {q}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/FollowUpSuggestions.jsx
git commit -m "feat: add FollowUpSuggestions component"
```

---

### Task 10: Update MessageBubble.jsx — syntax highlighting, KaTeX, tables, citations

**Files:**
- Modify: `frontend/src/components/MessageBubble.jsx`

- [ ] **Step 1: Update imports**

Replace the top of the file (lines 1-4) with:

```jsx
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import SourceGrid from "./SourceGrid";
import MessageActions from "./MessageActions";
import CitationBadge from "./CitationBadge";
import FollowUpSuggestions from "./FollowUpSuggestions";

const CITATION_RE = /\[(\d+)\]/g;

function renderParagraphChildren(children, sources) {
  const result = [];
  let key = 0;
  const walk = (node) => {
    if (typeof node === "string") {
      const parts = node.split(CITATION_RE);
      for (let i = 0; i < parts.length; i++) {
        if (i % 2 === 0) {
          if (parts[i]) result.push(<span key={key++}>{parts[i]}</span>);
        } else {
          result.push(<CitationBadge key={key++} index={parseInt(parts[i], 10)} sources={sources} />);
        }
      }
    } else if (Array.isArray(node)) {
      node.forEach(walk);
    } else {
      result.push(<span key={key++}>{node}</span>);
    }
  };
  walk(children);
  return result;
}
```

- [ ] **Step 2: Update component signature**

Change the function signature to accept `followups` and `onFollowUp`:

```jsx
export default function MessageBubble({
  role,
  content,
  sources = [],
  latencyMs,
  onRetry,
  followups,
  onFollowUp,
}) {
```

- [ ] **Step 3: Update ReactMarkdown — add plugins**

Change the `<ReactMarkdown>` opening tag from:

```jsx
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
```

to:

```jsx
        <ReactMarkdown
          remarkPlugins={[remarkGfm, remarkMath]}
          rehypePlugins={[rehypeKatex]}
```

- [ ] **Step 4: Replace the components map**

Replace the entire `components={{ ... }}` block with:

```jsx
          components={{
            p: ({ children }) => <p className="mb-3">{renderParagraphChildren(children, sources)}</p>,
            strong: ({ children }) => (
              <strong className="text-fg font-semibold">{children}</strong>
            ),
            ul: ({ children }) => (
              <ul className="mb-3 ml-5 list-disc marker:text-fg-muted">{children}</ul>
            ),
            ol: ({ children }) => (
              <ol className="mb-3 ml-5 list-decimal marker:text-fg-muted">{children}</ol>
            ),
            li: ({ children }) => <li className="mb-1.5 text-fg-secondary">{children}</li>,
            code: ({ className, children }) => {
              const match = /language-([\w+#.-]+)/.exec(className || "");
              const lang = match ? match[1] : "text";
              return match ? (
                <div className="relative group my-3">
                  <span className="absolute top-2 right-3 text-[10px] font-mono text-fg-muted z-10">
                    {lang}
                  </span>
                  <SyntaxHighlighter
                    language={lang}
                    style={oneDark}
                    customStyle={{
                      background: "var(--color-elevated)",
                      border: "1px solid var(--color-border)",
                      borderRadius: "8px",
                      fontSize: "12px",
                      margin: 0,
                    }}
                  >
                    {String(children).replace(/\n$/, "")}
                  </SyntaxHighlighter>
                </div>
              ) : (
                <code className="font-mono bg-elevated text-accent px-1.5 py-0.5 rounded text-[12px] border border-line">
                  {children}
                </code>
              );
            },
            pre: ({ children }) => <>{children}</>,
            a: ({ href, children }) => (
              <a href={href} className="text-accent underline hover:text-accent/80" target="_blank" rel="noopener noreferrer">
                {children}
              </a>
            ),
            blockquote: ({ children }) => (
              <blockquote className="border-l-2 border-accent/40 pl-3 text-fg-muted italic my-3">
                {children}
              </blockquote>
            ),
            table: ({ children }) => (
              <div className="overflow-x-auto my-3">
                <table className="w-full border-collapse text-xs">{children}</table>
              </div>
            ),
            thead: ({ children }) => <thead className="border-b border-line">{children}</thead>,
            th: ({ children }) => (
              <th className="text-left font-mono font-semibold text-fg-secondary px-3 py-2 border-b border-line">
                {children}
              </th>
            ),
            td: ({ children }) => (
              <td className="px-3 py-2 border-b border-line text-fg-secondary">{children}</td>
            ),
          }}
```

Note: The old `sup` renderer is REMOVED — citations are now handled by the paragraph text parser.

- [ ] **Step 5: Add FollowUpSuggestions rendering**

After the `</ReactMarkdown>` closing tag and before the `{sources.length > 0 && <SourceGrid .../>}` line, add:

```jsx
        {followups && followups.length > 0 && (
          <FollowUpSuggestions suggestions={followups} onSelect={onFollowUp} />
        )}
```

This goes inside the assistant message block (after the closing `</div>` of the prose container, before SourceGrid).

- [ ] **Step 6: Verify build**

Run: `cd frontend && npm run build`  
Expected: Build succeeds

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/MessageBubble.jsx
git commit -m "feat: syntax highlighting, KaTeX, tables, clickable citations in MessageBubble"
```

---

### Task 11: Update SourceCard.jsx — id + transition-all

**Files:**
- Modify: `frontend/src/components/SourceCard.jsx`

- [ ] **Step 1: Add id attribute and change transition class**

In the `<button>` element, add `id` and change `transition-colors` to `transition-all`:

```jsx
    <button
      type="button"
      id={`source-${index}`}
      className="w-full text-left bg-surface border border-line rounded-lg p-3 cursor-pointer hover:border-accent/20 transition-all"
      onClick={() => setOpen(!open)}
      aria-expanded={open}
      aria-label={`Source ${index}: ${filename}${open ? " (expanded)" : ""}`}
    >
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/SourceCard.jsx
git commit -m "feat: add id attr + transition-all to SourceCard for citation linking"
```

---

### Task 12: Update ChatWindow.jsx — chain saves, followups, onFollowUp

**Files:**
- Modify: `frontend/src/components/ChatWindow.jsx`

- [ ] **Step 1: Add followups to session load mapping**

In the `useEffect` that loads session (around line 43-48), update the message mapping:

```jsx
        const loadedMsgs = (data.messages || []).map((m) => ({
          role: m.role,
          content: m.content,
          sources: m.sources || [],
          latencyMs: m.latency_ms,
          followups: m.followups || null,
        }));
```

- [ ] **Step 2: Chain user → assistant saves and handle followups**

Replace the save block inside the streaming `onComplete` callback (around lines 124-139):

```jsx
        if (sessionId) {
          saveMessage(sessionId, { role: "user", content: question })
            .then(() =>
              saveMessage(sessionId, {
                role: "assistant",
                content: assistantContent,
                latency_ms: elapsed,
                model: selectedModel,
              })
            )
            .then((res) => {
              if (res.auto_title) {
                onMessageSaved?.(res.auto_title);
              }
              if (res.followups) {
                setMessages((prev) => {
                  const updated = [...prev];
                  updated[updated.length - 1] = {
                    ...updated[updated.length - 1],
                    followups: res.followups,
                  };
                  return updated;
                });
              }
            })
            .catch(() => {});
        }
```

- [ ] **Step 3: Add handleFollowUp and pass to MessageBubble**

Before the `return` statement, add:

```jsx
  const handleFollowUp = (q) => handleSend(q);
```

In the message map (around line 214-220), add `followups` and `onFollowUp` props:

```jsx
          {messages.map((msg, i) => (
            <MessageBubble
              key={i}
              {...msg}
              onFollowUp={handleFollowUp}
              onRetry={msg.role === "assistant" && i === messages.length - 1 ? handleRetry : null}
            />
          ))}
```

Note: `{...msg}` already spreads `followups` from the message object, so no need to pass it separately.

- [ ] **Step 4: Build and verify**

Run: `cd frontend && npm run build`  
Expected: Build succeeds

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/ChatWindow.jsx
git commit -m "feat: chain saves, followup state, onFollowUp handler in ChatWindow"
```

---

### Task 13: Update main.jsx — KaTeX CSS import

**Files:**
- Modify: `frontend/src/main.jsx`

- [ ] **Step 1: Add KaTeX CSS import**

After the existing CSS import, add:

```jsx
import "katex/dist/katex.min.css";
```

- [ ] **Step 2: Build and verify**

Run: `cd frontend && npm run build`  
Expected: Build succeeds, no errors

- [ ] **Step 3: Commit**

```bash
git add frontend/src/main.jsx
git commit -m "feat: import KaTeX CSS from npm package"
```

---

### Task 14: Final build + push

- [ ] **Step 1: Full frontend build**

Run: `cd frontend && npm run build`  
Expected: Clean build with no errors

- [ ] **Step 2: Backend smoke test**

Run: `cd backend && python -c "from main import app; print('Backend imports OK')"`

- [ ] **Step 3: Push all commits**

```bash
git push origin main
```
