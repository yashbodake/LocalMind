# Advanced Chat & Session Features Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add session search, session pinning, model-swap regeneration, slash commands, @-mention documents, and message feedback.

**Architecture:** Backend gets two new DB columns (`pinned`, `feedback`), one new endpoint (feedback PATCH), and expanded `update_session`. Frontend gets two new components (`SlashCommandMenu`, `MentionMenu`), plus modifications to 7 existing components.

**Tech Stack:** React 19, FastAPI, SQLite, Tailwind CSS, Lucide icons.

---

### Task 1: Backend — Database Migrations + Functions

**Files:**
- Modify: `backend/database.py`

- [ ] **Step 1: Add migrations to `init_db()`**

After the existing `followups` migration block, add two more:

```python
    try:
        conn.execute("ALTER TABLE sessions ADD COLUMN pinned INTEGER DEFAULT 0")
    except sqlite3.OperationalError:
        pass
    try:
        conn.execute("ALTER TABLE messages ADD COLUMN feedback TEXT DEFAULT NULL")
    except sqlite3.OperationalError:
        pass
```

- [ ] **Step 2: Update `get_sessions()` to include `pinned` and sort**

```python
def get_sessions() -> list[dict]:
    conn = get_db()
    rows = conn.execute(
        """SELECT s.id, s.title, s.updated_at, s.pinned,
                  (SELECT COUNT(*) FROM messages m WHERE m.session_id = s.id) as message_count
           FROM sessions s
           ORDER BY s.pinned DESC, s.updated_at DESC"""
    ).fetchall()
    return [dict(row) for row in rows]
```

- [ ] **Step 3: Update `update_session()` to accept `pinned`**

Add `pinned: int | None = None` to the function signature. In the UPDATE logic:

```python
    new_pinned = pinned if pinned is not None else existing["pinned"] if "pinned" in existing.keys() else 0
```

And add `pinned` to the UPDATE SET clause and params.

- [ ] **Step 4: Add `update_message_feedback()` function**

```python
def update_message_feedback(message_id: str, feedback: str | None) -> bool:
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute(
        "UPDATE messages SET feedback = ? WHERE id = ?",
        (feedback, message_id),
    )
    conn.commit()
    return cursor.rowcount > 0
```

- [ ] **Step 5: Verify `get_session()` already returns all columns**

The existing `get_session()` does `SELECT *` and builds dicts, so `feedback` and `pinned` are automatically included after migration. No change needed.

- [ ] **Step 6: Commit**

```bash
git add backend/database.py
git commit -m "feat(c7): DB migrations for pinned sessions + message feedback"
```

---

### Task 2: Backend — Schemas + Routes

**Files:**
- Modify: `backend/models/session_schemas.py`
- Modify: `backend/routes/sessions.py`

- [ ] **Step 1: Update `SessionUpdate` and add `FeedbackUpdate`**

In `session_schemas.py`:

```python
class SessionUpdate(BaseModel):
    title: Optional[str] = None
    model: Optional[str] = None
    doc_ids: Optional[list[str]] = None
    pinned: Optional[int] = None


class FeedbackUpdate(BaseModel):
    feedback: Optional[Literal["up", "down"]] = None
```

- [ ] **Step 2: Update `update_session` route to pass `pinned`**

```python
@router.patch("/{session_id}")
async def update_session(session_id: str, payload: SessionUpdate):
    result = db_update_session(
        session_id,
        title=payload.title,
        model=payload.model,
        doc_ids=payload.doc_ids,
        pinned=payload.pinned,
    )
```

Import `update_session as db_update_session` already exists — just add the `pinned` arg.

- [ ] **Step 3: Add feedback endpoint**

```python
from database import update_message_feedback as db_update_feedback
from models.session_schemas import SessionCreate, SessionUpdate, MessageCreate, FeedbackUpdate

@router.patch("/{session_id}/messages/{message_id}/feedback")
async def update_feedback(session_id: str, message_id: str, payload: FeedbackUpdate):
    updated = db_update_feedback(message_id, payload.feedback)
    if not updated:
        raise HTTPException(status_code=404, detail="Message not found")
    return {"status": "ok", "feedback": payload.feedback}
```

- [ ] **Step 4: Commit**

```bash
git add backend/models/session_schemas.py backend/routes/sessions.py
git commit -m "feat(c7): SessionUpdate.pinned + FeedbackUpdate schema + feedback endpoint"
```

---

### Task 3: Frontend — API Functions + App State

**Files:**
- Modify: `frontend/src/hooks/useChat.js`
- Modify: `frontend/src/App.jsx`

- [ ] **Step 1: Update `updateSession()` in `useChat.js`**

Add `pinned` to destructured params and JSON body:

```javascript
export async function updateSession(id, { title, model, doc_ids, pinned }) {
  const res = await fetch(`${API_BASE}/sessions/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title, model, doc_ids, pinned }),
  });
  if (!res.ok) throw new Error("Failed to update session");
  return res.json();
}
```

- [ ] **Step 2: Add `updateFeedback()` in `useChat.js`**

```javascript
export async function updateFeedback(sessionId, messageId, feedback) {
  const res = await fetch(`${API_BASE}/sessions/${sessionId}/messages/${messageId}/feedback`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ feedback }),
  });
  if (!res.ok) throw new Error("Failed to update feedback");
  return res.json();
}
```

- [ ] **Step 3: Update `App.jsx` to store full source list and pass `documents`**

Add a `sources` state that stores the full source objects (not just doc_ids):

```javascript
const [sources, setSources] = useState([]);
```

In the existing `getSources()` effect:
```javascript
getSources()
  .then((data) => {
    setSources(data.sources || []);
    if (selectedDocIds === null) {
      const ids = (data.sources || []).map((s) => s.doc_id);
      setSelectedDocIds(ids);
    }
  })
```

Pass `documents={sources}` to `<ChatWindow>`.

Add a `useMemo` for sorted sessions:
```javascript
const sortedSessions = useMemo(
  () => [...sessions].sort((a, b) => (b.pinned || 0) - (a.pinned || 0) || new Date(b.updated_at) - new Date(a.updated_at)),
  [sessions]
);
```

Pass `sortedSessions` to `<Sidebar>` instead of `sessions`.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/hooks/useChat.js frontend/src/App.jsx
git commit -m "feat(c7): updateSession pinned + updateFeedback API + App source list + sorted sessions"
```

---

### Task 4: Sidebar — Session Search + Pin

**Files:**
- Modify: `frontend/src/components/Sidebar.jsx`

- [ ] **Step 1: Add search input state**

```javascript
const [searchQuery, setSearchQuery] = useState("");
```

Add a search input between the "new --chat" button and the sessions header:

```jsx
{sessions.length > 5 && (
  <div className="px-3 pb-1">
    <input
      type="text"
      value={searchQuery}
      onChange={(e) => setSearchQuery(e.target.value)}
      placeholder="Search sessions…"
      aria-label="Search sessions"
      className="w-full bg-elevated border border-line rounded-lg px-2.5 py-1.5 text-fg text-xs font-sans placeholder:text-fg-muted outline-none focus:border-accent/30"
    />
  </div>
)}
```

- [ ] **Step 2: Filter sessions by search**

```javascript
const filteredSessions = searchQuery
  ? sessions.filter((s) => s.title.toLowerCase().includes(searchQuery.toLowerCase()))
  : sessions;
```

Use `filteredSessions` in the `.map()` and the empty-state message.

- [ ] **Step 3: Add pin button**

Import `Pin` from lucide-react. In the hover action buttons (next to rename/delete), add:

```jsx
<button
  onClick={() => {
    const newPinned = s.pinned ? 0 : 1;
    updateSession(s.id, { pinned: newPinned });
    onSessionUpdate(s.id, { pinned: newPinned });
  }}
  className={`p-1 rounded hover:bg-accent/10 ${s.pinned ? "text-accent" : "text-fg-muted hover:text-accent"}`}
  aria-label={s.pinned ? "Unpin session" : "Pin session"}
  aria-pressed={s.pinned ? "true" : "false"}
>
  <Pin size={11} aria-hidden="true" />
</button>
```

For pinned sessions, show the pin icon permanently (not just on hover). Change the opacity class conditionally:
```
className={`... ${s.pinned ? "opacity-100" : "opacity-0 group-hover:opacity-100"} ...`}
```

- [ ] **Step 4: Update empty state for search**

```jsx
{filteredSessions.length === 0 ? (
  <p className="text-xs text-fg-muted text-center py-4 px-2">
    {searchQuery ? "No sessions found" : "No conversations yet"}
  </p>
) : (
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/Sidebar.jsx
git commit -m "feat(c7): session search filter + pin/favorite button"
```

---

### Task 5: SlashCommandMenu Component

**Files:**
- Create: `frontend/src/components/SlashCommandMenu.jsx`
- Create: `frontend/src/data/slashCommands.js`

- [ ] **Step 1: Create slash commands data file**

```javascript
export const SLASH_COMMANDS = [
  {
    cmd: "/summarize",
    label: "Summarize",
    description: "Summarize key points from documents",
    prefix: "Provide a comprehensive summary of the key points from the retrieved context about:",
  },
  {
    cmd: "/explain",
    label: "Explain",
    description: "Explain a topic in simple terms",
    prefix: "Explain the following topic in simple terms with clear examples:",
  },
  {
    cmd: "/compare",
    label: "Compare",
    description: "Compare different perspectives",
    prefix: "Compare and contrast different perspectives from the sources on:",
  },
  {
    cmd: "/list",
    label: "List",
    description: "List key facts and figures",
    prefix: "List the key facts, figures, and data points from the retrieved context about:",
  },
];
```

- [ ] **Step 2: Create SlashCommandMenu.jsx**

```jsx
import { Slash } from "lucide-react";

export default function SlashCommandMenu({ commands, selectedIndex, onSelect }) {
  return (
    <div className="absolute bottom-full left-0 right-0 mb-2 bg-surface border border-line rounded-lg shadow-xl z-30 max-h-[200px] overflow-y-auto">
      <div className="px-3 py-1.5 border-b border-line">
        <span className="font-mono text-[9px] font-semibold uppercase tracking-wider text-fg-muted">
          Commands
        </span>
      </div>
      <ul role="listbox">
        {commands.map((cmd, i) => (
          <li key={cmd.cmd} role="option" aria-selected={i === selectedIndex}>
            <button
              type="button"
              onClick={() => onSelect(cmd)}
              className={`w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors ${
                i === selectedIndex ? "bg-accent/10" : "hover:bg-elevated"
              }`}
            >
              <Slash size={12} className="text-accent shrink-0" aria-hidden="true" />
              <div className="min-w-0">
                <p className="font-mono text-xs text-fg-secondary">{cmd.cmd}</p>
                <p className="text-[10px] text-fg-muted truncate">{cmd.description}</p>
              </div>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/SlashCommandMenu.jsx frontend/src/data/slashCommands.js
git commit -m "feat(c7): SlashCommandMenu component + command definitions"
```

---

### Task 6: MentionMenu Component

**Files:**
- Create: `frontend/src/components/MentionMenu.jsx`

- [ ] **Step 1: Create MentionMenu.jsx**

```jsx
import { FileText } from "lucide-react";

export default function MentionMenu({ documents, selectedIndex, onSelect }) {
  return (
    <div className="absolute bottom-full left-0 right-0 mb-2 bg-surface border border-line rounded-lg shadow-xl z-30 max-h-[200px] overflow-y-auto">
      <div className="px-3 py-1.5 border-b border-line">
        <span className="font-mono text-[9px] font-semibold uppercase tracking-wider text-fg-muted">
          Mention a document
        </span>
      </div>
      <ul role="listbox">
        {documents.map((doc, i) => (
          <li key={doc.doc_id} role="option" aria-selected={i === selectedIndex}>
            <button
              type="button"
              onClick={() => onSelect(doc)}
              className={`w-full flex items-center gap-2 px-3 py-2 text-left transition-colors ${
                i === selectedIndex ? "bg-accent/10" : "hover:bg-elevated"
              }`}
            >
              <FileText size={12} className="text-fg-muted shrink-0" aria-hidden="true" />
              <span className="text-xs text-fg-secondary truncate">{doc.filename}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/MentionMenu.jsx
git commit -m "feat(c7): MentionMenu component for @-mention document autocomplete"
```

---

### Task 7: ChatInput — Slash Command + @-Mention Triggers

**Files:**
- Modify: `frontend/src/components/ChatInput.jsx`

- [ ] **Step 1: Add imports and state**

```javascript
import SlashCommandMenu from "./SlashCommandMenu";
import MentionMenu from "./MentionMenu";
import { SLASH_COMMANDS } from "../data/slashCommands";
```

New state:
```javascript
const [slashOpen, setSlashOpen] = useState(false);
const [slashIndex, setSlashIndex] = useState(0);
const [mentionOpen, setMentionOpen] = useState(false);
const [mentionIndex, setMentionIndex] = useState(0);
const [mentionQuery, setMentionQuery] = useState("");
```

New prop: `documents` (array of `{ doc_id, filename }`).

- [ ] **Step 2: Add effect to detect triggers**

```javascript
useEffect(() => {
  if (input.startsWith("/") && !input.includes(" ")) {
    const matches = SLASH_COMMANDS.filter((c) => c.cmd.startsWith(input));
    setSlashOpen(matches.length > 0);
    setSlashIndex(0);
    setMentionOpen(false);
  } else {
    setSlashOpen(false);
    // Check for @ mention
    const lastAtIndex = input.lastIndexOf("@");
    if (lastAtIndex !== -1) {
      const afterAt = input.slice(lastAtIndex + 1);
      if (!afterAt.includes(" ") && afterAt.length <= 50) {
        const matches = (documents || []).filter((d) =>
          d.filename.toLowerCase().includes(afterAt.toLowerCase())
        );
        setMentionOpen(matches.length > 0);
        setMentionQuery(afterAt);
        setMentionIndex(0);
      } else {
        setMentionOpen(false);
      }
    } else {
      setMentionOpen(false);
    }
  }
}, [input, documents]);
```

- [ ] **Step 3: Update `onKeyDown` to handle menus**

```javascript
const menuOpen = slashOpen || mentionOpen;

const onKeyDown = (e) => {
  if (menuOpen) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      const max = slashOpen ? SLASH_COMMANDS.filter((c) => c.cmd.startsWith(input)).length - 1 : matchedDocs.length - 1;
      if (slashOpen) setSlashIndex((prev) => Math.min(prev + 1, max));
      else setMentionIndex((prev) => Math.min(prev + 1, max));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      if (slashOpen) setSlashIndex((prev) => Math.max(prev - 1, 0));
      else setMentionIndex((prev) => Math.max(prev - 1, 0));
      return;
    }
    if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      if (slashOpen) handleSlashSelect(SLASH_COMMANDS.filter((c) => c.cmd.startsWith(input))[slashIndex]);
      else handleMentionSelect(matchedDocs[mentionIndex]);
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      setSlashOpen(false);
      setMentionOpen(false);
      return;
    }
  }
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    handleSend();
  }
};
```

- [ ] **Step 4: Add selection handlers**

```javascript
const matchedDocs = (documents || []).filter((d) =>
  d.filename.toLowerCase().includes(mentionQuery.toLowerCase())
);

const handleSlashSelect = (cmd) => {
  const restOfInput = input.replace(/^\/\w*/, "").trim();
  setInput(restOfInput ? `${cmd.prefix} ${restOfInput}` : `${cmd.prefix} `);
  setSlashOpen(false);
  textareaRef.current?.focus();
};

const handleMentionSelect = (doc) => {
  const lastAtIndex = input.lastIndexOf("@");
  if (lastAtIndex !== -1) {
    const before = input.slice(0, lastAtIndex);
    setInput(`${before}@${doc.filename} `);
  }
  setMentionOpen(false);
  textareaRef.current?.focus();
};
```

- [ ] **Step 5: Update `handleSend` to parse @-mentions**

```javascript
const handleSend = () => {
  const q = input.trim();
  if (!q || streaming) return;

  const mentionRegex = /@([^\s]+(?:\.[a-zA-Z0-9]+))/g;
  const mentionedDocs = [];
  let match;
  while ((match = mentionRegex.exec(q)) !== null) {
    const doc = (documents || []).find((d) => d.filename === match[1]);
    if (doc) mentionedDocs.push(doc.doc_id);
  }

  onSend(q, mentionedDocs.length > 0 ? mentionedDocs : undefined);
  setInput("");
  setSlashOpen(false);
  setMentionOpen(false);
};
```

- [ ] **Step 6: Render menus in the input container**

Add inside the input container div (the one with `relative` positioning context):

```jsx
{slashOpen && (
  <SlashCommandMenu
    commands={SLASH_COMMANDS.filter((c) => c.cmd.startsWith(input))}
    selectedIndex={slashIndex}
    onSelect={handleSlashSelect}
  />
)}
{mentionOpen && (
  <MentionMenu
    documents={matchedDocs}
    selectedIndex={mentionIndex}
    onSelect={handleMentionSelect}
  />
)}
```

The input container needs `relative` class (already has it implicitly from the parent).

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/ChatInput.jsx
git commit -m "feat(c7): ChatInput — slash command + @-mention triggers with keyboard nav"
```

---

### Task 8: MessageActions — Model Dropdown + Feedback

**Files:**
- Modify: `frontend/src/components/MessageActions.jsx`

- [ ] **Step 1: Add imports and props**

```javascript
import { useState } from "react";
import { Copy, Check, RotateCcw, ChevronDown, ThumbsUp, ThumbsDown } from "lucide-react";

export default function MessageActions({ content, latencyMs, onRetry, onRetryWithModel, models, feedback, onFeedback }) {
  const [copied, setCopied] = useState(false);
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
```

- [ ] **Step 2: Add model dropdown next to Retry**

```jsx
{onRetry && (
  <div className="relative flex items-center">
    <button
      onClick={onRetry}
      className="flex items-center gap-1.5 px-2.5 py-1 border border-line rounded-l-md text-fg-muted hover:text-fg-secondary hover:border-line-hover text-xs transition-colors font-sans"
      aria-label="Retry response"
    >
      <RotateCcw size={12} aria-hidden="true" />
      Retry
    </button>
    {onRetryWithModel && models && (
      <>
        <button
          onClick={() => setModelMenuOpen(!modelMenuOpen)}
          className="flex items-center px-1.5 py-1 border border-l-0 border-line rounded-r-md text-fg-muted hover:text-fg-secondary hover:border-line-hover text-xs transition-colors font-sans"
          aria-label="Regenerate with different model"
          aria-expanded={modelMenuOpen}
        >
          <ChevronDown size={12} aria-hidden="true" />
        </button>
        {modelMenuOpen && (
          <div className="absolute bottom-full left-0 mb-1 bg-surface border border-line rounded-lg shadow-xl z-30 min-w-[200px]">
            <ul>
              {models.map((m) => (
                <li key={m}>
                  <button
                    onClick={() => {
                      onRetryWithModel(m);
                      setModelMenuOpen(false);
                    }}
                    className="w-full text-left px-3 py-1.5 text-xs text-fg-secondary hover:bg-accent/10 font-mono truncate"
                  >
                    {m}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </>
    )}
  </div>
)}
```

- [ ] **Step 3: Add feedback buttons**

After the Retry section, before the latency display:

```jsx
{onFeedback && (
  <>
    <button
      onClick={() => onFeedback(feedback === "up" ? null : "up")}
      className={`flex items-center gap-1 px-2 py-1 border rounded-md text-xs transition-colors font-sans ${
        feedback === "up"
          ? "border-accent/30 text-accent bg-accent/10"
          : "border-line text-fg-muted hover:text-fg-secondary hover:border-line-hover"
      }`}
      aria-label="Mark as helpful"
      aria-pressed={feedback === "up"}
    >
      <ThumbsUp size={12} aria-hidden="true" />
    </button>
    <button
      onClick={() => onFeedback(feedback === "down" ? null : "down")}
      className={`flex items-center gap-1 px-2 py-1 border rounded-md text-xs transition-colors font-sans ${
        feedback === "down"
          ? "border-accent/30 text-accent bg-accent/10"
          : "border-line text-fg-muted hover:text-fg-secondary hover:border-line-hover"
      }`}
      aria-label="Mark as not helpful"
      aria-pressed={feedback === "down"}
    >
      <ThumbsDown size={12} aria-hidden="true" />
    </button>
  </>
)}
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/MessageActions.jsx
git commit -m "feat(c7): MessageActions — model dropdown for retry + thumbs up/down feedback"
```

---

### Task 9: MessageBubble — Prop Passthrough

**Files:**
- Modify: `frontend/src/components/MessageBubble.jsx`

- [ ] **Step 1: Add new props to component signature**

Add `feedback`, `onFeedback`, `onRetryWithModel`, `models` to the destructured props.

- [ ] **Step 2: Pass props to MessageActions**

```jsx
<MessageActions
  content={content}
  latencyMs={latencyMs}
  onRetry={onRetry}
  onRetryWithModel={onRetryWithModel}
  models={models}
  feedback={feedback}
  onFeedback={onFeedback}
/>
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/MessageBubble.jsx
git commit -m "feat(c7): MessageBubble — thread feedback + model retry props to MessageActions"
```

---

### Task 10: ChatWindow — Integration

**Files:**
- Modify: `frontend/src/components/ChatWindow.jsx`

- [ ] **Step 1: Import `getModels` and `updateFeedback`**

```javascript
import { queryStream, getSession, saveMessage, truncateMessages, getModels, updateFeedback } from "../hooks/useChat";
```

- [ ] **Step 2: Add models state + fetch**

```javascript
const [models, setModels] = useState([]);

useEffect(() => {
  getModels()
    .then((data) => setModels(data.models || []))
    .catch(() => {});
}, []);
```

- [ ] **Step 3: Add `id` + `feedback` to session-load mapping**

In the `getSession()` effect, update the message mapping:

```javascript
const loadedMsgs = (data.messages || []).map((m) => ({
  id: m.id,
  role: m.role,
  content: m.content,
  sources: m.sources || [],
  latencyMs: m.latency_ms,
  followups: m.followups || null,
  feedback: m.feedback || null,
}));
```

- [ ] **Step 4: Write back `id` after `saveMessage`**

In the `onDone` callback after `saveMessage` for the assistant message:

```javascript
.then((res) => {
  if (res.id) {
    setMessages((prev) => {
      const updated = [...prev];
      updated[updated.length - 1] = {
        ...updated[updated.length - 1],
        id: res.id,
      };
      return updated;
    });
  }
  // ... existing auto_title + followups logic
})
```

- [ ] **Step 5: Update `handleSend` to accept `modelOverride`**

Change signature to `handleSend = async (question, modelOverride, overrideDocIds)`. Use `const effectiveModel = modelOverride || selectedModel;` and `const effectiveDocIds = overrideDocIds || selectedDocIds;` throughout. Replace all `selectedModel` references inside handleSend with `effectiveModel`.

- [ ] **Step 6: Update `handleRetry` to accept `modelOverride`**

```javascript
const handleRetry = (modelOverride) => {
  if (!lastQueryRef.current) return;
  const { question } = lastQueryRef.current;
  if (modelOverride) {
    onSelectModel(modelOverride);
  }
  setMessages((prev) => prev.slice(0, -1));
  handleSend(question, modelOverride);
};
```

- [ ] **Step 7: Add `handleFeedback`**

```javascript
const handleFeedback = async (messageIndex, feedback) => {
  const msg = messages[messageIndex];
  if (!msg?.id) return;

  setMessages((prev) => {
    const updated = [...prev];
    updated[messageIndex] = { ...updated[messageIndex], feedback };
    return updated;
  });

  try {
    await updateFeedback(sessionId, msg.id, feedback);
  } catch (err) {
    console.error("Feedback failed:", err);
    setMessages((prev) => {
      const updated = [...prev];
      updated[messageIndex] = { ...updated[messageIndex], feedback: msg.feedback };
      return updated;
    });
  }
};
```

- [ ] **Step 8: Update `handleSend` call from ChatInput**

ChatInput now passes `mentionedDocIds` as second arg. Update `onSend`:

```javascript
const handleSendFromInput = (question, mentionedDocIds) => {
  handleSend(question, null, mentionedDocIds);
};
```

Pass `onSend={handleSendFromInput}` to ChatInput.

- [ ] **Step 9: Pass new props to MessageBubble**

```jsx
<MessageBubble
  key={i}
  {...msg}
  messageIndex={i}
  streaming={streaming}
  onEdit={msg.role === "user" ? handleEdit : null}
  onFollowUp={handleFollowUp}
  onRetry={msg.role === "assistant" && i === messages.length - 1 ? handleRetry : null}
  onRetryWithModel={msg.role === "assistant" && i === messages.length - 1 ? handleRetry : null}
  models={models}
  onFeedback={msg.role === "assistant" ? (feedback) => handleFeedback(i, feedback) : null}
/>
```

- [ ] **Step 10: Pass `documents` to ChatInput**

```jsx
<ChatInput
  ref={inputRef}
  onSend={handleSendFromInput}
  onStop={handleStop}
  streaming={streaming}
  selectedModel={selectedModel}
  onSelectModel={onSelectModel}
  selectedDocIds={selectedDocIds}
  documents={documents}
/>
```

Add `documents` to ChatWindow's destructured props.

- [ ] **Step 11: Commit**

```bash
git add frontend/src/components/ChatWindow.jsx
git commit -m "feat(c7): ChatWindow — model override, feedback handler, mention doc_ids, models, message IDs"
```

---

### Task 11: Manual Testing

- [ ] **Step 1: Start servers**

```bash
cd backend && python main.py
cd frontend && npm run dev
```

- [ ] **Step 2: Test session search** — Create 6+ sessions, verify search appears, filter works
- [ ] **Step 3: Test pin** — Pin a session, verify it moves to top, icon persists. Unpin, verify it moves back
- [ ] **Step 4: Test model retry** — Ask question, click retry caret, select different model, verify regeneration uses new model
- [ ] **Step 5: Test slash commands** — Type `/`, verify dropdown. Type `/sum`, select summarize. Verify prefix prepended
- [ ] **Step 6: Test @-mention** — Type `@`, verify document dropdown. Select a doc. Verify `@filename` inserted. Submit, verify only that doc is queried
- [ ] **Step 7: Test feedback** — Click thumbs up, verify active. Click again, verify unset. Reload session, verify persists
- [ ] **Step 8: Test Enter key guards** — Open slash menu, press Enter → verify command selected (not sent). Open mention menu, press Enter → verify document selected (not sent)
