# C2 — Answer Quality & Formatting Design Spec

**Date:** 2026-06-13  
**Status:** Draft  
**Depends on:** C1 (Sessions & Persistence)  
**Required by:** Nothing

## Problem

The system prompt is bare (`"You are a helpful assistant..."`), producing flat plain-text answers. Code blocks have no syntax highlighting. No LaTeX/math support. Inline citations `[1]` are decorative — they don't link to source cards. No follow-up suggestions after responses. Tables render unstyled.

## Solution

Six improvements: (1) rewrite the system prompt to demand structured markdown output, (2) add syntax highlighting via `react-syntax-highlighter`, (3) add LaTeX rendering via `remark-math` + `rehype-katex`, (4) style tables with Carbon design, (5) make inline citation badges clickable with scroll-to-source + highlight pulse, (6) generate suggested follow-up questions via LLM after each response, persisted to DB.

## Architecture

```
Backend Changes:
  llm/client.py (new — shared client/config extracted from generator.py)
    └─ get_client() → OpenAI
    └─ load_config() → dict
  llm/generator.py
    └─ SYSTEM_PROMPT rewritten (structured output instructions)
    └─ Refactored to use llm/client.py
  llm/title_generator.py
    └─ Refactored to use llm/client.py
  llm/followup_generator.py (new)
    └─ generate_followups(question, answer, model) → list[str]
  database.py
    └─ db_save_message: persist followups JSON field
    └─ schema: add followups TEXT column to messages table
  routes/sessions.py
    └─ POST /sessions/{id}/messages: chain saves, async followup gen

Frontend Changes:
  MessageBubble.jsx
    ├─ react-syntax-highlighter for code blocks (oneDark theme)
    ├─ KaTeX rendering for $...$ and $$...$$
    ├─ Carbon-styled tables, blockquotes, headings
    └─ Clickable citation badges via paragraph text parser → scroll to source
  SourceCard.jsx
    └─ id attribute + highlight pulse animation on citation click
  CitationBadge.jsx (new — small reusable component)
  FollowUpSuggestions.jsx (new)
    └─ Clickable suggestion pills below assistant responses
  ChatWindow.jsx
    └─ Chain user→assistant saves, store followups in message state
  main.jsx
    └─ import "katex/dist/katex.min.css"
  package.json
    └─ react-syntax-highlighter, remark-math, rehype-katex, katex
```

## 1. Shared LLM Client — `llm/client.py`

Extract `_get_client()` and `_load_config()` from `generator.py` into a shared module so `followup_generator.py` and `title_generator.py` can use them without importing underscore-prefixed privates:

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

`generator.py` and `title_generator.py` updated to import from `llm.client`.

## 2. System Prompt Rewrite

Replace `SYSTEM_PROMPT` in `backend/llm/generator.py`:

```
You are a helpful assistant answering questions based strictly on the provided context.

Format your response using markdown:
- Start with a **Brief Answer** (1-2 sentences)
- Use ## headings for distinct topics
- Use bullet points for lists and steps
- Use **bold** for key terms and important concepts
- Use tables for comparisons or structured data
- Use `inline code` for technical terms and ```code blocks``` for code
- Use $...$ for inline math and $$...$$ for block math
- Cite sources inline as [1], [2], etc.

If the answer is not found in the context, say "I couldn't find this in your knowledge base."
Do not make up information.
```

Note: Context builder already labels sources as `[Source 1 - filename, chunk N]`. System prompt tells LLM to cite as `[1]`. The `_build_context` function stays unchanged.

## 3. Code Syntax Highlighting

**Library:** `react-syntax-highlighter` (v15)
**Theme:** `oneDark` from Prism styles
**React 19 compatibility:** Install with `--legacy-peer-deps`. React-syntax-highlighter works fine at runtime with React 19; only the peerDependencies metadata is outdated.

In `MessageBubble.jsx`, replace the `pre`/`code` renderer:

```jsx
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";

pre: ({ children }) => <>{children}</>,

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
```

## 4. LaTeX/Math Rendering

**Libraries:** `remark-math` (v6), `rehype-katex` (v7), `katex` (v0.16)

CSS imported from npm package (not CDN) in `main.jsx`:
```jsx
import "katex/dist/katex.min.css";
```

In `MessageBubble.jsx`, add plugins:
```jsx
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";

<ReactMarkdown
  remarkPlugins={[remarkGfm, remarkMath]}
  rehypePlugins={[rehypeKatex]}
  ...
>
```

KaTeX render errors show raw LaTeX in red — handled by KaTeX's default error rendering.

## 5. Table Styling

Add `table`, `thead`, `th`, `td` renderers to the react-markdown components map:

```jsx
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
```

## 6. Inline Citation Linking

### Problem with `sup` renderer

react-markdown v10 renders `[1]` as plain text inside a `<p>` element — the `sup` component renderer never fires. We need a custom paragraph text parser.

### Solution: CitationBadge component + paragraph text walker

**`CitationBadge.jsx`** (new):

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

**Paragraph renderer** in `MessageBubble.jsx`:

The `p` renderer walks its children (strings and elements), splits string segments on the `[N]` regex pattern, and injects `<CitationBadge>` elements for matches:

```jsx
import CitationBadge from "./CitationBadge";

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
          result.push(<CitationBadge key={key++} index={parseInt(parts[i])} sources={sources} />);
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

p: ({ children }) => <p className="mb-3">{renderParagraphChildren(children, sources)}</p>,
```

The regex split works because `String.split(regex)` with a capture group returns alternating non-match/match segments. Even indices are text, odd indices are captured digits.

### SourceCard.jsx: ID + transition

Add `id` attribute:

```jsx
<button
  type="button"
  id={`source-${index}`}
  className="w-full text-left bg-surface border border-line rounded-lg p-3 cursor-pointer hover:border-accent/20 transition-all"
  ...
>
```

The `ring-2 ring-accent` classes added by CitationBadge's onClick provide the highlight pulse. Note: SourceCard currently uses `transition-colors` — change it to `transition-all` so the ring appears/disappears smoothly. Also **remove the old `sup` entry** from the MessageBubble components map (it's now dead code since citations are handled by the paragraph text parser).

### MessageBubble: Pass `sources` to paragraph renderer

`MessageBubble` already receives `sources` as a prop. Pass it to `renderParagraphChildren`:

```jsx
<p className="mb-3">{renderParagraphChildren(children, sources)}</p>
```

## 7. Follow-Up Suggestions

### Backend: `llm/followup_generator.py`

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

### Backend: Persist followups in messages table

**database.py schema change:**

```sql
CREATE TABLE IF NOT EXISTS messages (
    ...
    followups TEXT DEFAULT NULL   -- JSON array of suggestion strings
);
```

Add migration: `ALTER TABLE messages ADD COLUMN followups TEXT DEFAULT NULL` wrapped in try/except (column may already exist).

**`db_save_message` signature:** Unchanged — followups are NOT passed at INSERT time (server generates them post-save).

**`get_session` response:** Include `followups` in message dict:

```python
"followups": json.loads(row["followups"]) if row["followups"] else None,
```

### Backend: Wire into route — chain saves, async followup gen

In `routes/sessions.py`, the `save_message` endpoint for assistant messages:

```python
import asyncio
from llm.followup_generator import generate_followups
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
        
        # Find last user message for followup generation
        last_user_msg = next(
            (m for m in reversed(session["messages"]) if m["role"] == "user"), None
        )
        if last_user_msg:
            followups = await asyncio.to_thread(
                generate_followups,
                last_user_msg["content"],
                payload.content,
                payload.model
            )

        # Auto-title (unchanged logic)
        if session and session["title"] == "New Chat":
            user_msgs = [m for m in session["messages"] if m["role"] == "user"]
            asst_msgs = [m for m in session["messages"] if m["role"] == "assistant"]
            if len(user_msgs) == 1 and len(asst_msgs) == 1:
                title = await asyncio.to_thread(
                    generate_title,
                    user_msgs[0]["content"], payload.content, payload.model
                )
                if title:
                    db_update_session(session_id, title=title)
                    auto_title = title

    # Persist followups to the message we just saved
    if followups:
        db_update_message_followups(result["id"], followups)
        result["followups"] = followups

    if auto_title:
        result["auto_title"] = auto_title

    return result
```

Need `db_update_message_followups(message_id, followups)` in database.py:

```python
def update_message_followups(message_id, followups):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute(
        "UPDATE messages SET followups = ? WHERE id = ?",
        (json.dumps(followups), message_id)
    )
    conn.commit()
```

### Frontend: Chain saves in ChatWindow.jsx

**Fix race condition:** Chain user → assistant saves instead of parallel:

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

### Frontend: `FollowUpSuggestions.jsx` (new component)

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

### Frontend: MessageBubble integration

Pass `followups` and `onFollowUp` to MessageBubble. Render FollowUpSuggestions below the assistant message content, before sources:

```jsx
{!isUser && followups && followups.length > 0 && (
  <FollowUpSuggestions suggestions={followups} onSelect={onFollowUp} />
)}
```

### Frontend: Session reload preserves followups

When `getSession()` loads messages, map `followups` field:

```jsx
const loadedMsgs = (data.messages || []).map((m) => ({
  role: m.role,
  content: m.content,
  sources: m.sources || [],
  latencyMs: m.latency_ms,
  followups: m.followups || null,
}));
```

## 8. Session Schema Update

`MessageCreate` Pydantic model is **unchanged** — the server generates followups internally after saving the assistant message, so the client never sends followups. The `followups` field exists only in the DB schema and API response.

### Frontend: `onFollowUp` callback wiring

**ChatWindow.jsx** — define handler and pass to MessageBubble:

```jsx
const handleFollowUp = (q) => handleSend(q);
```

In the message map:
```jsx
{messages.map((msg, i) => (
  <MessageBubble
    key={i}
    {...msg}
    followups={msg.followups}
    onFollowUp={handleFollowUp}
    onRetry={msg.role === "assistant" && i === messages.length - 1 ? handleRetry : null}
  />
))}
```

**MessageBubble.jsx** — update signature and render FollowUpSuggestions:

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

Import and render:
```jsx
import FollowUpSuggestions from "./FollowUpSuggestions";

// After the ReactMarkdown block, before SourceGrid:
{!isUser && followups && followups.length > 0 && (
  <FollowUpSuggestions suggestions={followups} onSelect={onFollowUp} />
)}
```

## New Dependencies

```
npm install --legacy-peer-deps react-syntax-highlighter remark-math rehype-katex katex
```

## Error Handling

| Scenario | Behavior |
|---|---|
| Syntax highlighter fails to load | Falls back to plain `<code>` block |
| KaTeX fails to render formula | Shows raw LaTeX in red (KaTeX default error display) |
| Follow-up generation fails (LLM error) | No suggestions shown, no error surfaced |
| Citation `[N]` has no matching source card | Click is a no-op (badge shows but scroll finds nothing) |
| Citation index > source count | Badge renders in muted color, click is no-op |

## Constraints

- Syntax highlighter adds ~200KB to bundle — acceptable for a local-first app
- KaTeX CSS imported from npm package (no CDN dependency)
- Follow-up generation adds ~1-2s latency after response — runs via `asyncio.to_thread` (non-blocking)
- System prompt change applies to all new queries; existing sessions see improvement on next query
- Followups persisted to DB — survive session reload
- User→assistant saves are chained (not parallel) to prevent race condition
