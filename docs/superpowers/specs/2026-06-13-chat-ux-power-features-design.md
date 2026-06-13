# C3 — Chat UX Power Features Design Spec

**Date:** 2026-06-13  
**Status:** Draft  
**Depends on:** C1 (Sessions & Persistence)  
**Required by:** Nothing

## Problem

Messages can only be copied or retried — no editing, no code-block copy, no export, no keyboard shortcuts. Power users are slowed down.

## Solution

Four features: (1) copy button on each code block, (2) edit question + regenerate answer with backend truncation, (3) export conversation as Markdown, (4) keyboard shortcuts (Cmd+K new chat, Cmd+L focus input, Esc stop generation).

## Architecture

```
Backend Changes:
  database.py
    └─ truncate_messages(session_id, from_index) → deletes messages from index N onwards
  routes/sessions.py
    └─ DELETE /sessions/{id}/messages?from_index={N} endpoint

Frontend Changes:
  MessageBubble.jsx
    ├─ Copy button on code blocks (floating top-right)
    ├─ Edit button on user messages (hover-revealed)
    └─ Edit mode: textarea + Save/Cancel
  ChatWindow.jsx
    ├─ handleEdit(index, newText): truncate + re-send
    ├─ Export button in header
    └─ Keyboard shortcut listener (Esc to stop)
  App.jsx
    └─ Keyboard shortcut listener (Cmd+K new chat, Cmd+L focus input)
  useChat.js
    └─ truncateMessages(sessionId, fromIndex)
  ChatInput.jsx
    └─ Forwarded ref for focus via keyboard shortcut
  useKeyboardShortcuts.js (new hook)
    └─ Centralized keyboard shortcut handler
```

## 1. Code Block Copy Button

In `MessageBubble.jsx`, modify the `code` renderer for block code to include a copy button:

```jsx
code: ({ className, children }) => {
  const match = /language-([\w+#.-]+)/.exec(className || "");
  const lang = match ? match[1] : "text";
  const rawCode = String(children).replace(/\n$/, "");
  return match ? (
    <CodeBlock lang={lang} code={rawCode} />
  ) : (
    <code className="font-mono bg-elevated text-accent px-1.5 py-0.5 rounded text-[12px] border border-line">
      {children}
    </code>
  );
},
```

New `CodeBlock.jsx` component:

```jsx
import { useState } from "react";
import { PrismLight as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import { Copy, Check } from "lucide-react";
import python from "react-syntax-highlighter/dist/esm/languages/prism/python";
import javascript from "react-syntax-highlighter/dist/esm/languages/prism/javascript";
import bash from "react-syntax-highlighter/dist/esm/languages/prism/bash";
import json from "react-syntax-highlighter/dist/esm/languages/prism/json";
import yaml from "react-syntax-highlighter/dist/esm/languages/prism/yaml";
import markdown from "react-syntax-highlighter/dist/esm/languages/prism/markdown";
import sql from "react-syntax-highlighter/dist/esm/languages/prism/sql";
import typescript from "react-syntax-highlighter/dist/esm/languages/prism/typescript";

SyntaxHighlighter.registerLanguage("python", python);
SyntaxHighlighter.registerLanguage("javascript", javascript);
SyntaxHighlighter.registerLanguage("bash", bash);
SyntaxHighlighter.registerLanguage("json", json);
SyntaxHighlighter.registerLanguage("yaml", yaml);
SyntaxHighlighter.registerLanguage("markdown", markdown);
SyntaxHighlighter.registerLanguage("sql", sql);
SyntaxHighlighter.registerLanguage("typescript", typescript);

export default function CodeBlock({ lang, code }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  return (
    <div className="relative group my-3">
      <div className="flex items-center justify-between px-3 py-1.5 bg-elevated border border-b-0 border-line rounded-t-lg">
        <span className="text-[10px] font-mono text-fg-muted">{lang}</span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 text-[10px] font-sans text-fg-muted hover:text-accent transition-colors"
          aria-label="Copy code"
        >
          {copied ? <Check size={11} aria-hidden="true" /> : <Copy size={11} aria-hidden="true" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <SyntaxHighlighter
        language={lang}
        style={oneDark}
        customStyle={{
          background: "var(--color-elevated)",
          border: "1px solid var(--color-border)",
          borderRadius: "0 0 8px 8px",
          fontSize: "12px",
          margin: 0,
        }}
      >
        {code}
      </SyntaxHighlighter>
    </div>
  );
}
```

This extracts the syntax highlighting logic from MessageBubble into its own component, reducing MessageBubble's complexity.

## 2. Edit Question + Regenerate

### Backend: Truncate Messages Endpoint

**database.py** — add function:

```python
def truncate_messages(session_id: str, from_index: int) -> int:
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute(
        "SELECT id FROM messages WHERE session_id = ? ORDER BY created_at ASC",
        (session_id,)
    )
    ids = [row["id"] for row in cursor.fetchall()]
    if from_index >= len(ids):
        return 0
    ids_to_delete = ids[from_index:]
    placeholders = ",".join("?" * len(ids_to_delete))
    cursor.execute(
        f"DELETE FROM messages WHERE id IN ({placeholders})",
        ids_to_delete
    )
    cursor.execute(
        "UPDATE sessions SET updated_at = ? WHERE id = ?",
        (datetime.now(UTC).isoformat(), session_id)
    )
    conn.commit()
    return cursor.rowcount
```

**routes/sessions.py** — add endpoint:

```python
from database import (
    ...
    truncate_messages as db_truncate_messages,
)

@router.delete("/{session_id}/messages")
async def truncate_session_messages(session_id: str, from_index: int = 0):
    deleted = db_truncate_messages(session_id, from_index)
    return {"status": "ok", "deleted_count": deleted}
```

### Frontend: useChat.js — add API function

```javascript
export async function truncateMessages(sessionId, fromIndex) {
  const res = await fetch(`${API_BASE}/sessions/${sessionId}/messages?from_index=${fromIndex}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error("Failed to truncate messages");
  return res.json();
}
```

### Frontend: MessageBubble.jsx — Edit Mode for User Messages

Add edit state and handlers:

```jsx
import { useState } from "react";
import { Pencil, X } from "lucide-react";

export default function MessageBubble({
  role,
  content,
  sources = [],
  latencyMs,
  onRetry,
  followups,
  onFollowUp,
  onEdit,
  messageIndex,
  streaming,
}) {
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(content);
  const isUser = role === "user";

  const handleEditSubmit = () => {
    const trimmed = editText.trim();
    if (!trimmed || trimmed === content) {
      setEditing(false);
      return;
    }
    onEdit?.(messageIndex, trimmed);
    setEditing(false);
  };

  const handleEditCancel = () => {
    setEditText(content);
    setEditing(false);
  };
```

User message rendering with edit capability:

```jsx
  if (isUser) {
    if (editing) {
      return (
        <div className="flex flex-col items-end mb-7 gap-2">
          <div className="w-full max-w-[75%]">
            <div className="font-mono text-[10px] font-semibold uppercase tracking-wider text-fg-muted mb-1.5">
              &gt; editing query
            </div>
            <textarea
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleEditSubmit(); }
                if (e.key === "Escape") handleEditCancel();
              }}
              autoFocus
              rows={2}
              className="w-full bg-surface border border-accent/30 rounded-lg p-3 text-fg text-lg font-normal leading-snug outline-none resize-none"
              aria-label="Edit your question"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleEditCancel}
              className="flex items-center gap-1 px-2.5 py-1 border border-line rounded-md text-fg-muted hover:text-fg text-xs transition-colors"
            >
              <X size={12} aria-hidden="true" /> Cancel
            </button>
            <button
              onClick={handleEditSubmit}
              className="flex items-center gap-1 px-2.5 py-1 border border-accent/30 bg-accent/10 rounded-md text-accent text-xs transition-colors"
            >
              Submit & Regenerate
            </button>
          </div>
        </div>
      );
    }

    return (
      <div className="group flex justify-end mb-7">
        <div className="max-w-[75%]">
          <div className="flex items-center gap-2 mb-1.5">
            <button
              onClick={() => setEditing(true)}
              className={`text-fg-muted hover:text-accent transition-opacity ${streaming ? "opacity-0 pointer-events-none" : "opacity-0 group-hover:opacity-100"}`}
              aria-label="Edit question"
              disabled={streaming}
            >
              <Pencil size={11} aria-hidden="true" />
            </button>
            <div className="font-mono text-[10px] font-semibold uppercase tracking-wider text-fg-muted">
              &gt; query
            </div>
          </div>
          <div className="text-fg text-lg font-normal leading-snug">
            {content}
          </div>
        </div>
      </div>
    );
  }
```

### Frontend: ChatWindow.jsx — handleEdit

```jsx
const handleEdit = async (messageIndex, newText) => {
  if (streaming) return;
  setError(null);

  const truncateFrom = messageIndex;
  const savedMessages = [...messages];

  setMessages((prev) => {
    const kept = prev.slice(0, truncateFrom);
    return [...kept, { role: "user", content: newText }];
  });

  try {
    await truncateMessages(sessionId, truncateFrom);
  } catch (err) {
    console.error("Truncate failed:", err);
    setMessages(savedMessages);
    setError("Failed to edit. Please try again.");
    return;
  }

  setStreaming(true);

  const history = messages
    .slice(0, Math.max(0, truncateFrom - MAX_HISTORY_TURNS * 2))
    .slice(-MAX_HISTORY_TURNS * 2)
    .map((m) => ({ role: m.role, content: m.content }));

  setMessages((prev) => [
    ...prev,
    { role: "assistant", content: "", sources: [] },
  ]);

  let assistantContent = "";
  const controller = new AbortController();
  abortRef.current = controller;
  lastQueryRef.current = { question: newText, history, model: selectedModel, doc_ids: selectedDocIds };
  latencyRef.current = Date.now();

  await queryStream(
    newText,
    { history, model: selectedModel, doc_ids: selectedDocIds },
    (chunk) => {
      assistantContent += chunk;
      setMessages((prev) => {
        const updated = [...prev];
        updated[updated.length - 1] = {
          role: "assistant",
          content: assistantContent,
          sources: [],
        };
        return updated;
      });
    },
    () => {
      const elapsed = Date.now() - latencyRef.current;
      setStreaming(false);
      setMessages((prev) => {
        const updated = [...prev];
        updated[updated.length - 1] = {
          ...updated[updated.length - 1],
          latencyMs: elapsed,
        };
        return updated;
      });

      if (sessionId) {
        saveMessage(sessionId, { role: "user", content: newText })
          .then(() =>
            saveMessage(sessionId, {
              role: "assistant",
              content: assistantContent,
              latency_ms: elapsed,
              model: selectedModel,
            })
          )
          .then((res) => {
            if (res.auto_title) onMessageSaved?.(res.auto_title);
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
          .catch((err) => console.error("Save failed:", err));
      }
    },
    (err) => {
      setStreaming(false);
      setError("Failed to get a response. Please try again.");
    },
    controller.signal
  );
};
```

### ChatInput.jsx — Expose focus method via forwardRef

```jsx
import { useImperativeHandle, forwardRef, useState, useRef, useEffect } from "react";
import { ArrowUp, Square } from "lucide-react";
import ModelSelector from "./ModelSelector";

const ChatInput = forwardRef(function ChatInput({
  onSend,
  onStop,
  streaming,
  selectedModel,
  onSelectModel,
  selectedDocIds,
}, ref) {
  const [input, setInput] = useState("");
  const textareaRef = useRef(null);

  useImperativeHandle(ref, () => ({
    focus: () => textareaRef.current?.focus(),
  }));

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 168) + "px";
  }, [input]);

  // ... rest of existing component logic unchanged
});

export default ChatInput;
```

### ChatWindow.jsx — sessionTitle state + export wiring

Store session title when loading:

```jsx
const [sessionTitle, setSessionTitle] = useState("");

// In the getSession().then() block:
setSessionTitle(data.title || "Conversation");
```

Export button disabled during streaming:

```jsx
<button
  onClick={handleExport}
  disabled={messages.length === 0 || streaming}
  className="p-1.5 rounded-lg text-fg-secondary hover:text-accent disabled:opacity-30 transition-colors"
  aria-label="Export conversation"
  title="Export as Markdown"
>
  <Download size={16} aria-hidden="true" />
</button>
```

### ChatWindow.jsx — Pass streaming + onEdit + messageIndex to MessageBubble

```jsx
{messages.map((msg, i) => (
  <MessageBubble
    key={i}
    {...msg}
    messageIndex={i}
    streaming={streaming}
    onEdit={msg.role === "user" ? handleEdit : null}
    onFollowUp={handleFollowUp}
    onRetry={msg.role === "assistant" && i === messages.length - 1 ? handleRetry : null}
  />
))}
```

## 3. Export Conversation

### Frontend: Export utility function

Create `frontend/src/utils/exportChat.js`:

```javascript
export function exportToMarkdown(session, messages) {
  const lines = [];
  lines.push(`# ${session?.title || "Conversation"}`);
  lines.push("");
  lines.push(`Exported: ${new Date().toLocaleString()}`);
  lines.push("");

  for (const msg of messages) {
    if (msg.role === "user") {
      lines.push("## ❓ Question");
      lines.push("");
      lines.push(msg.content);
      lines.push("");
    } else {
      lines.push("## 💡 Answer");
      lines.push("");
      lines.push(msg.content);
      lines.push("");
      if (msg.latencyMs) {
        lines.push(`> Latency: ${msg.latencyMs}ms`);
        lines.push("");
      }
      if (msg.sources && msg.sources.length > 0) {
        lines.push("### Sources");
        lines.push("");
        msg.sources.forEach((src, i) => {
          lines.push(`${i + 1}. **${src.filename}** (chunk ${src.chunk_index}, score: ${src.score?.toFixed(2) || "N/A"})`);
        });
        lines.push("");
      }
      if (msg.followups && msg.followups.length > 0) {
        lines.push("### Suggested Follow-ups");
        lines.push("");
        msg.followups.forEach((q) => lines.push(`- ${q}`));
        lines.push("");
      }
    }
    lines.push("---");
    lines.push("");
  }

  const blob = new Blob([lines.join("\n")], { type: "text/markdown" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${(session?.title || "conversation").replace(/[^a-z0-9]/gi, "-").toLowerCase()}.md`;
  a.click();
  URL.revokeObjectURL(url);
}
```

### Frontend: Export button in ChatWindow

Add an export button to the ChatWindow header (mobile bar area and as a floating button for desktop):

```jsx
import { Download } from "lucide-react";
import { exportToMarkdown } from "../utils/exportChat";

const handleExport = () => {
  exportToMarkdown({ title: sessionTitle, id: sessionId }, messages);
};

// In the header area:
<button
  onClick={handleExport}
  disabled={messages.length === 0}
  className="p-1.5 rounded-lg text-fg-secondary hover:text-accent disabled:opacity-30 transition-colors"
  aria-label="Export conversation"
  title="Export as Markdown"
>
  <Download size={16} aria-hidden="true" />
</button>
```

The export button needs session title. Pass it from App.jsx via the session data, or store it in ChatWindow state when session loads.

## 4. Keyboard Shortcuts

### Frontend: useKeyboardShortcuts.js hook

Uses internal refs to avoid re-registering the event listener on every render:

```javascript
import { useEffect, useRef } from "react";

export function useKeyboardShortcuts({ onNewChat, onFocusInput, onStop, streaming }) {
  const handlersRef = useRef({ onNewChat, onFocusInput, onStop, streaming });
  handlersRef.current = { onNewChat, onFocusInput, onStop, streaming };

  useEffect(() => {
    const handler = (e) => {
      const mod = e.metaKey || e.ctrlKey;

      if (mod && e.key === "k") {
        e.preventDefault();
        handlersRef.current.onNewChat?.();
      }

      if (mod && e.key === "l") {
        e.preventDefault();
        handlersRef.current.onFocusInput?.();
      }

      if (e.key === "Escape" && handlersRef.current.streaming) {
        e.preventDefault();
        handlersRef.current.onStop?.();
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);
}
```

### App.jsx — Wire Cmd+K only (new chat)

Cmd+K (new chat) is global, handled in App.jsx. Cmd+L (focus input) and Esc (stop) are handled in ChatWindow.jsx where the input ref and streaming state live.

```jsx
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";

useKeyboardShortcuts({
  onNewChat: newChat,
  onFocusInput: null,
  onStop: null,
  streaming: false,
});
```

### ChatWindow.jsx — Wire Cmd+L + Esc

```jsx
import { useKeyboardShortcuts } from "../hooks/useKeyboardShortcuts";

const inputRef = useRef(null);

useKeyboardShortcuts({
  onNewChat: null,
  onFocusInput: () => inputRef.current?.focus(),
  onStop: handleStop,
  streaming,
});

<ChatInput ref={inputRef} ... />
```

## Error Handling

| Scenario | Behavior |
|---|---|
| Truncate fails (network/DB error) | Messages reverted to saved state, error shown |
| Export with empty conversation | Button disabled |
| Export during streaming | Button disabled |
| Edit to same content | No-op (cancel edit) |
| Edit while streaming | Edit button hidden + `handleEdit` early-returns |
| Esc key during edit mode | Cancels edit (textarea handler), does NOT trigger stop (streaming is false during edit) |
| Keyboard shortcut while typing in input | Cmd+K and Cmd+L still fire (intentional) |
| Code copy fails | Silent no-op (existing pattern) |

## Constraints

- Edit + regenerate truncates the DB — deleted messages are unrecoverable
- Export downloads as Markdown only (no PDF/JSON for now)
- Keyboard shortcuts: Cmd+K, Cmd+L, Esc — minimal but high-value set
- Code copy button shows on all code blocks, not just fenced ones with language
