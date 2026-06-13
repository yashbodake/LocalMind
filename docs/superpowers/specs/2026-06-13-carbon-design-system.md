# Carbon Design System — UX & Visual Polish Spec

**Date:** 2026-06-13  
**Status:** Approved  
**Sub-project:** B of 3 (Core RAG v2 → UX Polish → Engineering & Advanced)

---

## 1. Overview

A full visual redesign of LocalMind's frontend using the **Carbon** design direction — a developer-first dark UI with cyan accents, monospace metadata, and CLI-inspired structure. The redesign adds markdown rendering, dark/light theming, chat controls, responsive layout, and polished empty states.

### 1.1 Design Principles

Guided by the frontend-design skill:

- **Ground it in the subject:** LocalMind is a developer tool for self-hosted RAG. The aesthetic references terminal/CLI vernacular (`>` prompts, monospace labels, system status panels) without sacrificing readability.
- **One signature element:** The cyan accent (#22d3ee) used as glow, active state, citation badge, and status indicator. Everything else stays quiet and disciplined.
- **Typography carries personality:** Three-font stack — Space Grotesk (brand), Inter (body), JetBrains Mono (code/metadata). Each has a clear role.
- **Avoided AI-default looks:** No warm cream + serif + terracotta. No near-black + acid-green. No broadsheet hairlines.

### 1.2 Non-Goals

- Backend changes (all polish is frontend-only)
- New API endpoints
- Automated visual regression tests (Sub-project C territory)
- Animations beyond micro-interactions (no page-load sequences, no scroll reveals)
- Accessibility audit beyond basic keyboard focus + reduced motion (Sub-project C)

---

## 2. Design System

### 2.1 Palette

**Dark (default):**

| Token | Hex | Use |
|---|---|---|
| `bg-base` | `#0c0c0e` | Chat area background |
| `bg-surface` | `#0e0e11` | Sidebar, cards, input box |
| `bg-elevated` | `#16161a` | Code blocks, hover states |
| `border` | `#1a1a20` | Dividers, card borders |
| `border-hover` | `#27272a` | Hover borders |
| `text-primary` | `#e4e4e7` | Body text, headings |
| `text-secondary` | `#a1a1aa` | Labels, metadata |
| `text-muted` | `#52525b` | Timestamps, footnotes |
| `accent` | `#22d3ee` | Cyan — active states, citations, links |
| `accent-dim` | `rgba(34,211,238,0.08)` | Subtle accent backgrounds |
| `accent-glow` | `rgba(34,211,238,0.25)` | Borders, glows on interactive elements |

**Light variant:**

| Token | Hex |
|---|---|
| `bg-base` | `#ffffff` |
| `bg-surface` | `#f8fafc` |
| `bg-elevated` | `#f1f5f9` |
| `border` | `#e2e8f0` |
| `border-hover` | `#cbd5e1` |
| `text-primary` | `#1e293b` |
| `text-secondary` | `#475569` |
| `text-muted` | `#94a3b8` |
| `accent` | `#0891b2` (slightly darker cyan for contrast) |

### 2.2 Typography

| Role | Font | Weights | Usage |
|---|---|---|---|
| Display | Space Grotesk | 500, 600, 700 | Brand name, logo letter |
| Body | Inter | 400, 450, 500, 600, 700 | Chat content, UI labels, buttons |
| Mono | JetBrains Mono | 400, 500, 600, 700 | Metadata, code, CLI labels, scores, system info |

Type scale: 10px (micro labels) → 12px (metadata) → 14px (body) → 18px (user query) → 22px (page title).

### 2.3 Tailwind Configuration

- Dark mode strategy: `class` (toggle `dark` class on `<html>`)
- Custom theme colors mapped to the palette tokens above
- Font families: `font-display` (Space Grotesk), `font-sans` (Inter), `font-mono` (JetBrains Mono)
- Fonts loaded via Google Fonts `<link>` in `index.html`

### 2.4 Custom Logo

- Source file: `gpt-image-1_a_create_the_image_or_.png` (1024x1024 RGBA)
- Copied to `frontend/public/logo.png`
- Rendered at 34x34px with `border-radius: 9px` in `BrandLogo.jsx`

---

## 3. Component Architecture

### 3.1 New Components

| Component | Responsibility |
|---|---|
| `BrandLogo.jsx` | Logo image + "LocalMind" wordmark (Space Grotesk) + version badge |
| `SystemStatus.jsx` | Footer panel in sidebar: model name, reranker, vector count, avg latency |
| `ChatInput.jsx` | Auto-resize textarea, CLI `>` prefix, model selector, send/stop button |
| `MessageActions.jsx` | Copy / Retry buttons + latency badge, rendered under each AI response |
| `SourceGrid.jsx` | 2-column grid of source cards with snippet previews and mono scores |
| `TypingIndicator.jsx` | Cyan-pulsing dots shown while waiting for first token |
| `ThemeToggle.jsx` | Sun/moon icon button, persists preference to localStorage |
| `ScrollToBottom.jsx` | Floating button that appears when user scrolls up during streaming |

### 3.2 Modified Components

| Component | Changes |
|---|---|
| `App.jsx` | Add `theme` state + toggle, `sidebarOpen` state for mobile, pass to children |
| `Sidebar.jsx` | Carbon restyle, add BrandLogo + SystemStatus + ThemeToggle, checkbox redesign, mobile drawer behavior |
| `ChatWindow.jsx` | Extract ChatInput + MessageActions. Full-width AI messages with `>` labels. Suggested prompts in empty state. |
| `MessageBubble.jsx` | User = right-aligned bubble. AI = full-width with `> response` label, markdown rendering, inline citations. |
| `SourceCard.jsx` | Redesign as grid card: `[1]` badge, filename, score in mono, snippet preview |
| `ModelSelector.jsx` | Restyle with JetBrains Mono, cyan accent on active model |
| `FileUploader.jsx` | Carbon restyle with dashed border, cyan hover |

### 3.3 Component Tree

```
App.jsx
├── state: theme, sidebarOpen, selectedModel, selectedDocIds
├── Sidebar.jsx (drawer on mobile)
│   ├── BrandLogo.jsx
│   ├── ThemeToggle.jsx
│   ├── SystemStatus.jsx
│   ├── FileUploader.jsx
│   └── Source list (checkboxes)
├── ChatWindow.jsx
│   ├── ScrollToBottom.jsx (conditional)
│   ├── MessageBubble.jsx (user = bubble)
│   ├── MessageBubble.jsx (AI = full-width + markdown)
│   │   ├── ReactMarkdown
│   │   ├── SourceGrid.jsx
│   │   │   └── SourceCard.jsx
│   │   └── MessageActions.jsx
│   ├── TypingIndicator.jsx (while waiting)
│   └── ChatInput.jsx
│       └── ModelSelector.jsx
```

---

## 4. Markdown Rendering

### 4.1 Library

`react-markdown` + `remark-gfm` (GitHub Flavored Markdown: tables, strikethrough, task lists, autolinks)

### 4.2 Rendering Rules

- **AI messages only** — rendered through `<ReactMarkdown remarkPlugins={[remarkGfm]}>`
- **User messages** — plain text, no markdown (prevents injection, keeps user input literal)
- **Code blocks** (`<pre><code>`) — `JetBrains Mono`, `bg-elevated` background, cyan text (`#67e8f9`), `border` border, 5px border-radius
- **Inline code** (`<code>`) — same styling, smaller padding
- **Bold** (`<strong>`) — `text-primary` color (brighter than body)
- **Lists** — dimmed markers (`text-muted`), 7px item spacing
- **Links** (`<a>`) — accent cyan with underline
- **Blockquotes** — left border in accent, muted text

### 4.3 Inline Citations

- The LLM already outputs `[1]`, `[2]` style references naturally
- These are detected in rendered markdown and styled as clickable cyan `<sup>` badges
- Clicking a citation scrolls to and briefly highlights the corresponding source card in `SourceGrid`
- Implementation: custom `sup` renderer in react-markdown component map that checks for citation pattern

### 4.4 Streaming Compatibility

- Markdown re-renders on each token chunk
- Partial markdown renders gracefully (an unclosed code block shows as text until the closing backticks arrive)
- No debouncing needed — react-markdown is fast enough for token-by-token updates

---

## 5. Dark/Light Theme

### 5.1 Implementation

- `dark` class on `<html>` element. Tailwind `dark:` variants handle the rest.
- `App.jsx` holds `theme` state: `"dark"` (default) or `"light"`
- On mount: read `localStorage.getItem("localmind-theme")`. If absent, default to `"dark"`.
- `ThemeToggle.jsx` toggles the class and saves to localStorage.

### 5.2 Toggle Location

- In sidebar header, next to BrandLogo — small sun/moon icon button
- Uses `lucide-react` `Sun` and `Moon` icons

### 5.3 Transition

- CSS `transition: background-color 0.2s, color 0.2s` on body and major containers
- No flash of wrong theme: inline `<script>` in `index.html` reads localStorage and sets class before React mounts

---

## 6. Chat Controls

### 6.1 New Chat

- Button in sidebar: `+ new --chat` (JetBrains Mono)
- Clears `messages` array in ChatWindow state
- Resets to empty state with suggested prompts

### 6.2 Copy

- `MessageActions` button under each AI response
- Uses `navigator.clipboard.writeText()`
- Button text changes to "Copied" with a check icon for 2 seconds, then reverts
- Copies raw markdown text (not HTML)

### 6.3 Retry

- `MessageActions` button under each AI response
- Removes the last AI response, re-sends the preceding user question through the streaming pipeline
- Uses the same history/model/doc_ids as the original query

### 6.4 Auto-resize Textarea

- In `ChatInput.jsx`
- Starts at 1 row, grows to max 6 rows, then scrolls internally
- Uses a `useRef` + `useEffect` pattern: on input change, set `height = 'auto'` then `height = scrollHeight`
- Shift+Enter inserts newline, Enter sends

### 6.5 Stop Streaming

- Send button transforms into a stop button (square icon) during streaming
- Uses `AbortController` to abort the fetch request
- Partial response is kept in the message

### 6.6 Latency Badge

- `MessageActions` shows `latency: 2671ms` in JetBrains Mono
- Value comes from measuring time between send and stream completion in `ChatInput`/`ChatWindow`
- For streaming: measures first-token-time and total-time separately

---

## 7. Responsive / Mobile

### 7.1 Breakpoints

- **Desktop** (`>768px`): Sidebar always visible (248px fixed), chat fills remaining width
- **Tablet/Mobile** (`<=768px`): Sidebar becomes off-canvas drawer

### 7.2 Mobile Sidebar

- Default hidden, slides in from left when toggled
- Hamburger button (lucide `Menu` icon) in a thin top bar above the chat area
- Semi-transparent overlay dims the chat area when sidebar is open
- Tapping overlay or selecting a source closes the sidebar

### 7.3 Mobile Chat

- Messages go full-width with reduced horizontal padding (16px instead of 36px)
- Source grid collapses to single column
- Input bar spans full width
- Max-width constraint on chat inner content removed on mobile

---

## 8. Empty States + Polish

### 8.1 No Messages (Welcome Screen)

- Centered logo image (64px)
- "Ask a question about your documents" heading (Inter, large)
- Subtext: "Upload files in the sidebar, then query your knowledge base"
- Three suggested prompt chips below (e.g., "What is RAG?", "Summarize my documents", "What are embeddings?")
- Chips are clickable — fills the input and focuses it

### 8.2 No Sources

- Shown in sidebar when source list is empty
- "Upload documents to get started" text with upward arrow pointing to FileUploader

### 8.3 Typing Indicator

- Three dots with cyan color and `pulse` animation
- Staggered animation delays (-0.3s, -0.15s, 0s)

### 8.4 Error States

- Cyan-bordered alert card with `AlertCircle` icon
- Clear message: "Failed to get a response" + "Please try again" or specific error
- Retry button when applicable

### 8.5 Scroll Behavior

- Auto-scroll to bottom on new tokens
- If user scrolls up more than 100px from bottom, pause auto-scroll
- `ScrollToBottom` floating button appears (cyan circle with down arrow)
- Clicking resumes auto-scroll and jumps to bottom

### 8.6 Suggested Prompts

- Stored as a constant array in ChatWindow
- When clicked, fills input textarea and focuses it (does not auto-send — user can edit)

---

## 9. Libraries

| Library | Version | Purpose |
|---|---|---|
| `react-markdown` | latest | Markdown rendering for AI responses |
| `remark-gfm` | latest | GitHub Flavored Markdown plugin |

Both added to `frontend/package.json` via npm install.

No new backend dependencies. No new frontend dependencies beyond these two.

---

## 10. Files Changed

### New Files
| File | Purpose |
|---|---|
| `frontend/src/components/BrandLogo.jsx` | Logo + wordmark |
| `frontend/src/components/SystemStatus.jsx` | Sidebar status panel |
| `frontend/src/components/ChatInput.jsx` | Input bar with auto-resize |
| `frontend/src/components/MessageActions.jsx` | Copy / Retry / latency |
| `frontend/src/components/SourceGrid.jsx` | Source card grid |
| `frontend/src/components/TypingIndicator.jsx` | Cyan pulsing dots |
| `frontend/src/components/ThemeToggle.jsx` | Dark/light toggle |
| `frontend/src/components/ScrollToBottom.jsx` | Floating scroll button |
| `frontend/public/logo.png` | Custom logo image |

### Modified Files
| File | Changes |
|---|---|
| `frontend/src/App.jsx` | Theme state, sidebar state, pass new props |
| `frontend/src/components/Sidebar.jsx` | Carbon restyle, BrandLogo, SystemStatus, ThemeToggle, mobile drawer |
| `frontend/src/components/ChatWindow.jsx` | Extract ChatInput/MessageActions, full-width AI, empty state, scroll logic |
| `frontend/src/components/MessageBubble.jsx` | Markdown rendering, citation styling, Carbon layout |
| `frontend/src/components/SourceCard.jsx` | Grid card redesign with snippets |
| `frontend/src/components/ModelSelector.jsx` | Carbon restyle |
| `frontend/src/components/FileUploader.jsx` | Carbon restyle |
| `frontend/src/index.css` | Font imports, theme transitions, scrollbar styling |
| `frontend/tailwind.config.js` | Carbon palette, font families, dark mode strategy |
| `frontend/index.html` | Google Fonts links, anti-flash theme script |

---

## 11. Testing Strategy

Manual verification checklist (no automated tests — Sub-project C):

- [ ] Dark mode: all components render correctly with Carbon palette
- [ ] Light mode: toggle works, all components readable, accent visible
- [ ] Theme persists across page reload
- [ ] Markdown: bold, code blocks, lists, links render in AI responses
- [ ] Citations: `[1]` style references render as cyan badges, click scrolls to source
- [ ] Copy button: copies text, shows "Copied" feedback
- [ ] Retry button: re-sends last question, replaces answer
- [ ] New chat button: clears conversation
- [ ] Auto-resize: textarea grows to 6 rows max
- [ ] Stop button: aborts streaming, keeps partial response
- [ ] Mobile (<768px): sidebar drawer, overlay, full-width messages
- [ ] Empty state: suggested prompts visible, clickable
- [ ] Scroll: auto-scroll pauses on manual scroll up, scroll-to-bottom button works
- [ ] Build: `vite build` passes with no errors
