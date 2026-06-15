# C7 — Advanced Chat & Session Features

## Date
2026-06-15

## Status
Approved

## Context
The chat experience has six gaps from the gap analysis, all HIGH priority:

1. **No session search** — Users with many sessions can't find old conversations by keyword.
2. **No pin/favorite** — Important sessions scroll down and get lost as new sessions are created.
3. **No regenerate with different model** — The Retry button always uses the same model. Users can't compare how different models answer the same question.
4. **No slash commands** — Common RAG operations (summarize, explain, compare) require manual prompt crafting every time.
5. **No @-mention** — Users must go to the sidebar to scope a query to specific documents. No inline document reference.
6. **No message feedback** — No quality signal on answers. Can't flag good/bad responses.

## Scope

### In Scope
- Session search (client-side title filter in sidebar)
- Session pinning (DB column + sort + UI)
- Regenerate with different model (model dropdown on retry)
- Slash commands (/summarize, /explain, /compare, /list — prompt templates)
- @-mention documents in query (inline autocomplete + doc_ids resolution)
- Message feedback (thumbs up/down on assistant messages, persisted)

### Out of Scope
- Full-text search within message content (only title search)
- Session folders/tags/labels
- Custom slash commands (user-defined)
- @-mention sessions or messages (only documents)
- Feedback analytics dashboard
- Feedback used for retrieval tuning (just stored)

## Design

---

### Feature 1: Session Search

**Approach:** Client-side filtering on session title.

**UI:** Search input above the sessions list in Sidebar. When typing, filter sessions by title (case-insensitive `includes`). Clear button (X) when text present. When no results, show "No sessions found".

**No backend changes.** The sessions list is already loaded in App.jsx and passed to Sidebar.

---

### Feature 2: Pin / Favorite Sessions

**Backend:**

Database migration in `init_db()`:
```sql
ALTER TABLE sessions ADD COLUMN pinned INTEGER DEFAULT 0;
```
(Using try/except pattern matching existing `followups` migration.)

`get_sessions()` updated:
- Include `pinned` in SELECT
- Sort: `pinned DESC, updated_at DESC`

`update_session()` updated:
- Accept `pinned: int | None` parameter
- Include in UPDATE query

`SessionUpdate` schema updated:
- Add `pinned: Optional[int] = None`

**Frontend:**

Sidebar session list:
- Each session row gets a pin button (lucide `Pin` / `PinOff`, 11px) on hover, next to rename/delete
- Pinned sessions show the pin icon permanently (not just on hover)
- Clicking pin calls `updateSession(id, { pinned: 1 })`, unpin calls `{ pinned: 0 }`
- App.jsx `handleSessionUpdate` already merges updates into session list — but sorting must be re-applied. `getSessions()` is re-fetched OR sessions are re-sorted client-side after pin toggle.

**Decision:** Client-side re-sort after pin toggle (avoids full refetch). Sort sessions by `pinned DESC, updated_at DESC` in a `useMemo` within App.jsx (so the sorted list is consistent everywhere it's consumed).

**Frontend API change required:** `useChat.js` `updateSession()` currently destructures only `{ title, model, doc_ids }`. Must add `pinned` to destructured params and include it in the JSON body. Without this, pin persistence silently fails.

---

### Feature 3: Regenerate with Different Model

**Approach:** The existing Retry button retries with the current `selectedModel` (the model dropdown's value). Add a model dropdown caret next to Retry that lets users pick a different model before regenerating.

**Important:** `handleRetry` currently calls `handleSend(question)` which reads `selectedModel` from React state. Since `setState` is async, calling `onSelectModel(model)` then `handleRetry()` in the same tick would retry with the OLD model. Therefore, `handleRetry` must accept `modelOverride` as a direct parameter and pass it through to `queryStream` explicitly.

**UI in MessageActions:**
- Existing Retry button: retries with the current model dropdown value (unchanged behavior)
- New: a small caret button (lucide `ChevronDown`, 12px) next to Retry
- Clicking the caret opens a dropdown of available models
- Models list is passed from ChatWindow → MessageBubble → MessageActions (ChatWindow fetches once via `getModels()` and caches in state)
- Selecting a model calls `onRetryWithModel(modelId)` which triggers retry with that specific model

**ChatWindow changes:**
- `handleSend` gains an optional `modelOverride` parameter. When provided, it's used directly in the `queryStream` call and `lastQueryRef` assignment instead of `selectedModel`. This avoids the async-state bug where `onSelectModel()` + `handleSend()` in the same tick uses stale state.
- `handleRetry` accepts an optional `modelOverride` parameter, passes it through to `handleSend(question, modelOverride)`
- When provided: calls `onSelectModel(modelOverride)` to update the model selector UI
- Updates `lastQueryRef.current.model` so subsequent retries are consistent

**Prop threading:** `onRetryWithModel` passes through ChatWindow → MessageBubble → MessageActions. MessageBubble already receives `onRetry`; add `onRetryWithModel` alongside it.

**Data flow:**
```
MessageActions → onRetryWithModel("meta/llama-3.3-70b-instruct")
  → ChatWindow.handleRetry("meta/llama-3.3-70b-instruct")
    → uses modelOverride in queryStream
    → updates lastQueryRef.current.model
    → calls onSelectModel("meta/llama-3.3-70b-instruct")
```

---

### Feature 4: Slash Commands

**Approach:** Prompt templates with inline dropdown. Frontend-only.

**Commands:**
```js
const SLASH_COMMANDS = [
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

**Trigger logic in ChatInput:**
- When the textarea value starts with `/` (first character), show the SlashCommandMenu
- Filter commands by what's typed: `/sum` shows `/summarize`
- Keyboard: ArrowUp/Down to navigate, Enter/Tab to select, Escape to dismiss
- **Critical:** When a menu is open, Enter must select the menu item, NOT send the message. The `onKeyDown` handler must check `if (menuOpen) { handle menu selection; return; }` before falling through to the send-on-Enter logic.
- On select: replace `/command` at the start with the command's `prefix` + space
  - Example: user types `/sum transformer architectures`
  - On selecting `/summarize`: text becomes `Provide a comprehensive summary of the key points from the retrieved context about: transformer architectures`
- If no command matches (e.g., `/xyz`), the menu dismisses and `/xyz` is sent as a normal query

**Menu coexistence rule:** Only one menu can be active at a time. Slash command menu takes precedence — when the input starts with `/`, the slash menu is shown and @-mention detection is suppressed. Once a command is selected (or dismissed), @-mention detection resumes normally.

**New component: `SlashCommandMenu.jsx`**
- Props: `commands` (filtered list), `selectedIndex`, `onSelect`, `onDismiss`
- Positioned absolutely above the ChatInput textarea
- Each item shows: `command name` (mono font, accent) + `description` (muted)
- Highlighted item: `bg-accent/10`

---

### Feature 5: @-mention Documents

**Approach:** Inline autocomplete dropdown + doc_ids resolution on submit.

**Trigger logic in ChatInput:**
- When user types `@` anywhere in the textarea, show MentionMenu
- Extract the text after `@` up to the next whitespace or cursor
- Filter documents whose `filename` contains that text (case-insensitive)
- Keyboard: ArrowUp/Down to navigate, Enter/Tab to select, Escape to dismiss
- **Critical:** Same Enter-key conflict as slash commands — when MentionMenu is open, Enter selects the item, does NOT send.
- On select: replace `@partial` with `@filename ` (with trailing space)
  - The `@filename` text stays in the query — the LLM benefits from seeing it
- If no documents match, the menu dismisses

**On submit:**
- Parse all `@filename` tokens from the query. Regex: `/@([^\s]+(?:\.[a-zA-Z0-9]+))/g` — matches `@word.ext` but not `@word` alone (requires file extension to avoid false matches on email-like patterns). For files without extensions, this means they can't be @-mentioned — acceptable limitation.
- Resolve each to `doc_id` using the document list
- If any @-mentions resolve: use ONLY those doc_ids (override sidebar selection)
- If no @-mentions: use sidebar-selected doc_ids (current behavior)
- The `@filename` text is NOT stripped from the query

**New component: `MentionMenu.jsx`**
- Props: `documents` (filtered list), `selectedIndex`, `onSelect`, `onDismiss`
- Positioned absolutely above the textarea (same position as SlashCommandMenu — above the input bar). Pixel-accurate caret tracking in a `<textarea>` is non-trivial (requires mirror-div technique); for v1, positioning above the input container is sufficient.
- Each item shows: `FileText` icon + `filename` (truncated)
- Highlighted item: `bg-accent/10`

**Document list source:** ChatInput already receives `selectedDocIds`. We need the full document list (filename → doc_id mapping). ChatInput will receive a new prop: `documents` (array of `{ doc_id, filename }`), passed from App.jsx which already fetches sources.

---

### Feature 6: Message Feedback

**Backend:**

Database migration in `init_db()`:
```sql
ALTER TABLE messages ADD COLUMN feedback TEXT DEFAULT NULL;
```

New function `update_message_feedback(message_id, feedback)`:
- Sets `feedback` column to `'up'`, `'down'`, or `NULL` (for unset)
- Returns bool success

`get_session()` updated:
- Include `feedback` in each message dict

New endpoint in `sessions.py`:
```python
@router.patch("/{session_id}/messages/{message_id}/feedback")
async def update_feedback(session_id: str, message_id: str, payload: FeedbackUpdate):
    ...
```

New schema `FeedbackUpdate`:
```python
class FeedbackUpdate(BaseModel):
    feedback: Optional[Literal["up", "down"]] = None
```

**Frontend:**

**Prerequisite — message IDs:** The feedback endpoint requires `message_id`, but ChatWindow's message objects currently lack an `id` field. Two changes required:
1. On session load (`ChatWindow.jsx` message mapping): add `id: m.id` and `feedback: m.feedback || null` to each message object
2. After `saveMessage()` returns (in the `onDone` callback): write the returned `result.id` back to the assistant message in state. This is needed for feedback on the current session's messages.

MessageActions.jsx:
- Two new buttons: thumbs up (lucide `ThumbsUp`) and thumbs down (lucide `ThumbsDown`)
- Active state: filled accent color when selected
- Inactive state: muted, same style as Copy/Retry
- Clicking toggles: if already "up" and click "up" again, unsets (sends `null`)
- Calls `onFeedback(feedback)` prop

MessageBubble.jsx:
- New prop: `feedback` and `onFeedback`
- Passed through from ChatWindow

ChatWindow.jsx:
- New handler: `handleFeedback(messageIndex, feedback)`
- Updates local message state
- Calls `updateFeedback(sessionId, messageId, feedback)` API
- On session load, restores feedback from message data

---

### Component Tree (new/modified)

```
App.jsx
  ├── Sidebar.jsx (modified: search input, pin button, pin sorting)
  │     └── sessions list (filtered by search, sorted by pinned DESC + updated_at)
  │
  └── ChatWindow.jsx (modified: model retry, feedback handler, mention doc_ids, models fetch)
        ├── MessageBubble.jsx (modified: feedback + onRetryWithModel prop passthrough)
        │     └── MessageActions.jsx (modified: model dropdown, feedback buttons)
        │
        └── ChatInput.jsx (modified: slash command + @-mention triggers)
              ├── SlashCommandMenu.jsx (new)
              └── MentionMenu.jsx (new)
```

### Backend Changes Summary

| File | Change |
|------|--------|
| `database.py` | `pinned` column migration, `feedback` column migration, `get_sessions()` sort+select, `update_session()` pinned param, `update_message_feedback()` function, `get_session()` feedback in message |
| `models/session_schemas.py` | `SessionUpdate.pinned`, new `FeedbackUpdate` model |
| `routes/sessions.py` | `update_session` passes pinned, new feedback endpoint |

### Frontend Changes Summary

| File | Change |
|------|--------|
| `App.jsx` | Store full source list in state (not just doc_ids), pass `documents` to ChatWindow, sort sessions by `pinned DESC, updated_at DESC` in useMemo |
| `Sidebar.jsx` | Search input, pin button |
| `ChatWindow.jsx` | Accept `documents` prop from App, pass to ChatInput. `handleSend(question, modelOverride?)`, `handleRetry(modelOverride?)`, `handleFeedback()`, parse @-mentions for doc_ids, fetch models via `getModels()`, pass `models` + `onRetryWithModel` + `feedback` + `onFeedback` to MessageBubble, add `id` + `feedback` to message objects on load and after save |
| `MessageBubble.jsx` | Pass `feedback` + `onFeedback` + `onRetryWithModel` + `models` to MessageActions |
| `MessageActions.jsx` | Model dropdown next to Retry (uses `models` prop), thumbs up/down buttons |
| `ChatInput.jsx` | Slash command trigger, @-mention trigger, menu-open state guards Enter key, `documents` prop for mention resolution |
| `SlashCommandMenu.jsx` | New — command dropdown |
| `MentionMenu.jsx` | New — document mention dropdown |
| `hooks/useChat.js` | `updateSession()` add `pinned` to body, new `updateFeedback()` API function |

### Accessibility

- Search input: `aria-label="Search sessions"`
- Pin button: `aria-label="Pin session"` / `aria-label="Unpin session"`, `aria-pressed`
- Slash command menu: `role="listbox"`, items `role="option"` with `aria-selected`
- Mention menu: `role="listbox"`, items `role="option"` with `aria-selected`
- Feedback buttons: `aria-label="Mark as helpful"` / `aria-label="Mark as not helpful"`, `aria-pressed`
- Model dropdown: `aria-label="Regenerate with model"`, `aria-expanded`, `aria-controls`

### Error Handling

- Pin toggle fails: revert UI state, show error toast (console.error for now)
- Feedback save fails: revert UI state, console.error
- @-mention resolution: unmatched filenames silently ignored (query proceeds with sidebar doc_ids)
- Slash command with no match: treated as normal text, sent as-is

## Testing

Manual testing checklist:
1. Type in session search → verify filtering by title, clear button works
2. Pin a session → verify it moves to top, pin icon persists; unpin → moves back
3. Ask a question, click Retry caret → verify model dropdown appears; select different model → verify regeneration uses new model
4. Type `/` in input → verify command menu appears; select a command → verify prefix is prepended
5. Type `@` in input → verify mention menu appears; select a document → verify `@filename` inserted
6. Submit query with @-mention → verify only that document is queried (check sources)
7. Click thumbs up on a response → verify active state; click again → verify unset
8. Reload session → verify feedback persists
