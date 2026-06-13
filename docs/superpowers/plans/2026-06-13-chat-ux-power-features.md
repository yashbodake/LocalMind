# C3 — Chat UX Power Features Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Add code block copy buttons, edit+regenerate, export conversation, and keyboard shortcuts.

**Architecture:** Backend adds a truncate endpoint. Frontend extracts CodeBlock component, adds edit mode to MessageBubble, adds export utility, and adds keyboard shortcut hook.

**Tech Stack:** FastAPI, SQLite, React 19, react-syntax-highlighter PrismLight

---

### Task 1: Backend — truncate_messages database function

**Files:**
- Modify: `backend/database.py`

- [ ] **Step 1: Read current database.py to find insertion point and imports**

- [ ] **Step 2: Add truncate_messages function**

Add at the end of the file (before any `if __name__` block if present):

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

Ensure `datetime` and `UTC` are imported (they should already be from existing code — check).

- [ ] **Step 3: Verify**

Run: `cd backend && python -c "from database import truncate_messages; print('OK')"`  
Expected: `OK`

- [ ] **Step 4: Commit**

```bash
git add backend/database.py
git commit -m "feat: add truncate_messages to database.py"
```

---

### Task 2: Backend — truncate endpoint in routes

**Files:**
- Modify: `backend/routes/sessions.py`

- [ ] **Step 1: Add import**

Add `truncate_messages as db_truncate_messages` to the existing `from database import (...)` block.

- [ ] **Step 2: Add endpoint**

After the existing `delete_session` endpoint, add:

```python
@router.delete("/{session_id}/messages")
async def truncate_session_messages(session_id: str, from_index: int = 0):
    deleted = db_truncate_messages(session_id, from_index)
    return {"status": "ok", "deleted_count": deleted}
```

- [ ] **Step 3: Verify**

Run: `cd backend && python -c "from routes.sessions import router; print('OK')"`  
Expected: `OK`

- [ ] **Step 4: Commit**

```bash
git add backend/routes/sessions.py
git commit -m "feat: add DELETE /sessions/{id}/messages truncate endpoint"
```

---

### Task 3: Frontend — truncateMessages API function

**Files:**
- Modify: `frontend/src/hooks/useChat.js`

- [ ] **Step 1: Read useChat.js to find API_BASE and export patterns**

- [ ] **Step 2: Add function**

Add alongside the other API functions. Use the same `API_BASE` prefix pattern used by existing functions:

```javascript
export async function truncateMessages(sessionId, fromIndex) {
  const res = await fetch(`${API_BASE}/sessions/${sessionId}/messages?from_index=${fromIndex}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error("Failed to truncate messages");
  return res.json();
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/hooks/useChat.js
git commit -m "feat: add truncateMessages API function"
```

---

### Task 4: Frontend — Create CodeBlock.jsx component

**Files:**
- Create: `frontend/src/components/CodeBlock.jsx`

- [ ] **Step 1: Create the file**

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

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/CodeBlock.jsx
git commit -m "feat: extract CodeBlock component with copy button"
```

---

### Task 5: Frontend — Update MessageBubble.jsx

**Files:**
- Modify: `frontend/src/components/MessageBubble.jsx`

- [ ] **Step 1: Update imports**

Remove the SyntaxHighlighter imports and language registrations (now in CodeBlock). Replace with:

```jsx
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import SourceGrid from "./SourceGrid";
import MessageActions from "./MessageActions";
import CitationBadge from "./CitationBadge";
import FollowUpSuggestions from "./FollowUpSuggestions";
import CodeBlock from "./CodeBlock";
import { Pencil, X } from "lucide-react";
import { useState } from "react";
```

Keep the `CITATION_RE` constant and `renderParagraphChildren` function unchanged.

- [ ] **Step 2: Update component signature**

```jsx
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

- [ ] **Step 3: Update user message rendering**

Add edit mode (when `editing` is true) and edit button (hover-revealed, hidden when streaming):

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
              Submit &amp; Regenerate
            </button>
          </div>
        </div>
      );
    }

    return (
      <div className="group flex justify-end mb-7">
        <div className="max-w-[75%]">
          <div className="flex items-center gap-2 mb-1.5">
            {onEdit && !streaming && (
              <button
                onClick={() => setEditing(true)}
                className="opacity-0 group-hover:opacity-100 text-fg-muted hover:text-accent transition-opacity"
                aria-label="Edit question"
              >
                <Pencil size={11} aria-hidden="true" />
              </button>
            )}
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

- [ ] **Step 4: Update code renderer to use CodeBlock**

In the `components` map, replace the existing `code` renderer with:

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

- [ ] **Step 5: Verify build**

Run: `cd frontend && npm run build`  
Expected: Success

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/MessageBubble.jsx
git commit -m "feat: edit mode for user messages, CodeBlock integration in MessageBubble"
```

---

### Task 6: Frontend — Create useKeyboardShortcuts hook

**Files:**
- Create: `frontend/src/hooks/useKeyboardShortcuts.js`

- [ ] **Step 1: Create the file**

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

- [ ] **Step 2: Commit**

```bash
git add frontend/src/hooks/useKeyboardShortcuts.js
git commit -m "feat: add useKeyboardShortcuts hook"
```

---

### Task 7: Frontend — Create export utility

**Files:**
- Create: `frontend/src/utils/exportChat.js`

- [ ] **Step 1: Create the file**

```javascript
export function exportToMarkdown(session, messages) {
  const lines = [];
  lines.push(`# ${session?.title || "Conversation"}`);
  lines.push("");
  lines.push(`Exported: ${new Date().toLocaleString()}`);
  lines.push("");

  for (const msg of messages) {
    if (msg.role === "user") {
      lines.push("## Question");
      lines.push("");
      lines.push(msg.content);
      lines.push("");
    } else {
      lines.push("## Answer");
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
  const safeName = (session?.title || "conversation").replace(/[^a-z0-9]/gi, "-").toLowerCase();
  a.download = `${safeName || "conversation"}.md`;
  a.click();
  URL.revokeObjectURL(url);
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/utils/exportChat.js
git commit -m "feat: add exportToMarkdown utility"
```

---

### Task 8: Frontend — Update ChatInput.jsx to forwardRef

**Files:**
- Modify: `frontend/src/components/ChatInput.jsx`

- [ ] **Step 1: Read current file**

- [ ] **Step 2: Convert to forwardRef**

Change the imports to include `forwardRef` and `useImperativeHandle`:

```jsx
import { useState, useRef, useEffect, forwardRef, useImperativeHandle } from "react";
```

Change the function declaration:

```jsx
const ChatInput = forwardRef(function ChatInput({
  onSend,
  onStop,
  streaming,
  selectedModel,
  onSelectModel,
  selectedDocIds,
}, ref) {
```

Add `useImperativeHandle` after the existing `textareaRef`:

```jsx
  useImperativeHandle(ref, () => ({
    focus: () => textareaRef.current?.focus(),
  }));
```

Change the export at the bottom:

```jsx
export default ChatInput;
```

- [ ] **Step 3: Verify build**

Run: `cd frontend && npm run build`  
Expected: Success

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/ChatInput.jsx
git commit -m "feat: convert ChatInput to forwardRef for keyboard focus"
```

---

### Task 9: Frontend — Update ChatWindow.jsx

**Files:**
- Modify: `frontend/src/components/ChatWindow.jsx`

- [ ] **Step 1: Update imports**

Add to the existing import from `useChat`:

```jsx
import { queryStream, getSession, saveMessage, truncateMessages } from "../hooks/useChat";
```

Add new imports:

```jsx
import { Download } from "lucide-react";
import { exportToMarkdown } from "../utils/exportChat";
import { useKeyboardShortcuts } from "../hooks/useKeyboardShortcuts";
```

- [ ] **Step 2: Add state + refs**

Add `sessionTitle` state:

```jsx
const [sessionTitle, setSessionTitle] = useState("");
const inputRef = useRef(null);
```

- [ ] **Step 3: Store title in session load**

In the `getSession().then()` block, add after setting messages:

```jsx
        setSessionTitle(data.title || "Conversation");
```

- [ ] **Step 4: Add keyboard shortcuts**

```jsx
useKeyboardShortcuts({
  onNewChat: null,
  onFocusInput: () => inputRef.current?.focus(),
  onStop: handleStop,
  streaming,
});
```

- [ ] **Step 5: Add handleEdit function**

After `handleRetry`, add:

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

    const history = savedMessages
      .slice(0, truncateFrom)
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
              if (res.auto_title) {
                onMessageSaved?.(res.auto_title);
                setSessionTitle(res.auto_title);
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

- [ ] **Step 6: Add handleExport + handleFollowUp**

```jsx
  const handleFollowUp = (q) => handleSend(q);

  const handleExport = () => {
    exportToMarkdown({ title: sessionTitle, id: sessionId }, messages);
  };
```

- [ ] **Step 7: Add export button to header**

In the mobile header area, after the hamburger menu and brand logo, add an export button. Also add a desktop export button:

```jsx
      <div className="md:hidden flex items-center gap-3 px-4 py-3 border-b border-line bg-surface">
        <button
          onClick={onOpenSidebar}
          className="p-1.5 rounded-lg text-fg-secondary hover:text-accent"
          aria-label="Open sidebar"
        >
          <Menu size={18} aria-hidden="true" />
        </button>
        <BrandLogo size="sm" />
        <button
          onClick={handleExport}
          disabled={messages.length === 0 || streaming}
          className="ml-auto p-1.5 rounded-lg text-fg-secondary hover:text-accent disabled:opacity-30 transition-colors"
          aria-label="Export conversation"
        >
          <Download size={16} aria-hidden="true" />
        </button>
      </div>
```

- [ ] **Step 8: Update message map**

Add `messageIndex`, `streaming`, `onEdit` props:

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

- [ ] **Step 9: Add ref to ChatInput**

```jsx
      <ChatInput
        ref={inputRef}
        onSend={handleSend}
        onStop={handleStop}
        streaming={streaming}
        selectedModel={selectedModel}
        onSelectModel={onSelectModel}
        selectedDocIds={selectedDocIds}
      />
```

- [ ] **Step 10: Verify build**

Run: `cd frontend && npm run build`  
Expected: Success

- [ ] **Step 11: Commit**

```bash
git add frontend/src/components/ChatWindow.jsx
git commit -m "feat: edit+regenerate, export, keyboard shortcuts in ChatWindow"
```

---

### Task 10: Frontend — Update App.jsx keyboard shortcuts

**Files:**
- Modify: `frontend/src/App.jsx`

- [ ] **Step 1: Add import**

```jsx
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";
```

- [ ] **Step 2: Add hook call**

After the `newChat` callback definition:

```jsx
  useKeyboardShortcuts({
    onNewChat: newChat,
    onFocusInput: null,
    onStop: null,
    streaming: false,
  });
```

- [ ] **Step 3: Verify build**

Run: `cd frontend && npm run build`  
Expected: Success

- [ ] **Step 4: Commit**

```bash
git add frontend/src/App.jsx
git commit -m "feat: Cmd+K keyboard shortcut for new chat in App.jsx"
```

---

### Task 11: Final build + push

- [ ] **Step 1: Full frontend build**

Run: `cd frontend && npm run build`  
Expected: Clean build

- [ ] **Step 2: Backend import check**

Run: `cd backend && python -c "from main import app; print('OK')"`

- [ ] **Step 3: Push**

```bash
git push origin main
```
