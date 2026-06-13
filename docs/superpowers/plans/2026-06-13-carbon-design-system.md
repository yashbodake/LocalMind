# Carbon Design System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign LocalMind's frontend with the Carbon design system — developer-dark UI with cyan accents, markdown rendering, dark/light theming, chat controls, and responsive layout.

**Architecture:** CSS custom properties drive theming (dark default, light variant via `.light` class on `<html>`). Tailwind maps those properties to utility classes. New leaf components (BrandLogo, ChatInput, MessageActions, etc.) are built first, then integrated into the rewritten Sidebar and ChatWindow containers.

**Tech Stack:** React 19, Tailwind CSS 3.4, react-markdown + remark-gfm, Inter + Space Grotesk + JetBrains Mono fonts

**Spec:** `docs/superpowers/specs/2026-06-13-carbon-design-system.md`

---

## File Structure

### New files
| File | Responsibility |
|---|---|
| `frontend/src/components/BrandLogo.jsx` | Logo image + wordmark + version badge |
| `frontend/src/components/SystemStatus.jsx` | Sidebar footer: model, reranker, vectors, latency |
| `frontend/src/components/ChatInput.jsx` | Auto-resize textarea, CLI prefix, model selector, send/stop |
| `frontend/src/components/MessageActions.jsx` | Copy / Retry buttons + latency badge |
| `frontend/src/components/SourceGrid.jsx` | 2-column source card grid |
| `frontend/src/components/TypingIndicator.jsx` | Cyan-pulsing dots |
| `frontend/src/components/ThemeToggle.jsx` | Sun/moon toggle, persists to localStorage |
| `frontend/src/components/ScrollToBottom.jsx` | Floating scroll-down button |
| `frontend/public/logo.png` | Custom logo (from user-provided image) |

### Modified files
| File | Changes |
|---|---|
| `frontend/tailwind.config.js` | Carbon palette (CSS var-based), font families, dark mode |
| `frontend/src/index.css` | CSS variables for dark/light, font imports, scrollbar, transitions |
| `frontend/index.html` | Google Fonts, anti-flash theme script, title, favicon |
| `frontend/vite.config.js` | Add `/models` to proxy |
| `frontend/src/hooks/useChat.js` | Add AbortSignal support to `queryStream` |
| `frontend/src/App.jsx` | Theme state, mobile sidebar state, pass new props |
| `frontend/src/components/Sidebar.jsx` | Full Carbon rewrite + BrandLogo + SystemStatus + ThemeToggle + mobile drawer |
| `frontend/src/components/ChatWindow.jsx` | Full Carbon rewrite + ChatInput + MessageActions + empty state + scroll logic |
| `frontend/src/components/MessageBubble.jsx` | Markdown rendering, citation badges, Carbon layout |
| `frontend/src/components/SourceCard.jsx` | Grid card redesign with snippet + mono score |
| `frontend/src/components/ModelSelector.jsx` | Carbon restyle |
| `frontend/src/components/FileUploader.jsx` | Carbon restyle |

---

## Task 1: Foundation — dependencies, Tailwind, CSS, fonts, logo

**Files:**
- Modify: `frontend/package.json`
- Modify: `frontend/tailwind.config.js`
- Modify: `frontend/src/index.css`
- Modify: `frontend/index.html`
- Modify: `frontend/vite.config.js`
- Create: `frontend/public/logo.png`

- [ ] **Step 1: Install react-markdown and remark-gfm**

Run:
```bash
cd frontend && npm install react-markdown remark-gfm
```

- [ ] **Step 2: Copy logo to public/**

Run:
```bash
cp "/home/yash/yash/Projects/RAG/.superpowers/brainstorm/20243-1781336786/content/gpt-image-1_a_create_the_image_or_.png" /home/yash/yash/Projects/RAG/frontend/public/logo.png
```

- [ ] **Step 3: Rewrite tailwind.config.js**

Replace the entire contents of `frontend/tailwind.config.js` with:

```js
/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        base: 'var(--color-base)',
        surface: 'var(--color-surface)',
        elevated: 'var(--color-elevated)',
        line: {
          DEFAULT: 'var(--color-border)',
          hover: 'var(--color-border-hover)',
        },
        fg: {
          DEFAULT: 'var(--color-text-primary)',
          secondary: 'var(--color-text-secondary)',
          muted: 'var(--color-text-muted)',
        },
        accent: 'var(--color-accent)',
      },
      fontFamily: {
        display: ['"Space Grotesk"', 'sans-serif'],
        sans: ['Inter', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
      },
    },
  },
  plugins: [],
}
```

- [ ] **Step 4: Rewrite index.css**

Replace the entire contents of `frontend/src/index.css` with:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  --color-base: #0c0c0e;
  --color-surface: #0e0e11;
  --color-elevated: #16161a;
  --color-border: #1a1a20;
  --color-border-hover: #27272a;
  --color-text-primary: #e4e4e7;
  --color-text-secondary: #a1a1aa;
  --color-text-muted: #52525b;
  --color-accent: #22d3ee;
}

.light {
  --color-base: #ffffff;
  --color-surface: #f8fafc;
  --color-elevated: #f1f5f9;
  --color-border: #e2e8f0;
  --color-border-hover: #cbd5e1;
  --color-text-primary: #1e293b;
  --color-text-secondary: #475569;
  --color-text-muted: #94a3b8;
  --color-accent: #0891b2;
}

* {
  transition: background-color 0.2s ease, border-color 0.2s ease;
}

body {
  font-family: 'Inter', sans-serif;
  background-color: var(--color-base);
  color: var(--color-text-primary);
}

::-webkit-scrollbar {
  width: 6px;
}
::-webkit-scrollbar-track {
  background: transparent;
}
::-webkit-scrollbar-thumb {
  background: var(--color-border-hover);
  border-radius: 3px;
}
::-webkit-scrollbar-thumb:hover {
  background: var(--color-text-muted);
}
```

- [ ] **Step 5: Rewrite index.html**

Replace the entire contents of `frontend/index.html` with:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/png" href="/logo.png" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600;700&family=Space+Grotesk:wght@500;600;700&display=swap" rel="stylesheet" />
    <title>LocalMind</title>
    <script>
      (function() {
        var theme = localStorage.getItem('localmind-theme') || 'dark';
        if (theme === 'light') document.documentElement.classList.add('light');
      })();
    </script>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
```

- [ ] **Step 6: Add /models to vite proxy**

Open `frontend/vite.config.js`. Add `'/models': 'http://localhost:8000',` to the proxy object so it becomes:

```js
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/ingest': 'http://localhost:8000',
      '/sources': 'http://localhost:8000',
      '/query': 'http://localhost:8000',
      '/health': 'http://localhost:8000',
      '/models': 'http://localhost:8000',
    },
  },
})
```

- [ ] **Step 7: Verify build**

Run: `cd frontend && npx vite build 2>&1 | tail -5`
Expected: successful build with no errors.

- [ ] **Step 8: Commit**

```bash
git add frontend/package.json frontend/package-lock.json frontend/tailwind.config.js frontend/src/index.css frontend/index.html frontend/vite.config.js frontend/public/logo.png
git commit -m "feat: Carbon design foundation — Tailwind palette, fonts, logo, markdown deps"
```

---

## Task 2: ThemeToggle + theme state in App.jsx

**Files:**
- Create: `frontend/src/components/ThemeToggle.jsx`
- Modify: `frontend/src/App.jsx`

- [ ] **Step 1: Create ThemeToggle.jsx**

Create `frontend/src/components/ThemeToggle.jsx`:

```jsx
import { Sun, Moon } from "lucide-react";

export default function ThemeToggle({ theme, onToggle }) {
  const isDark = theme === "dark";

  return (
    <button
      onClick={onToggle}
      className="p-1.5 rounded-lg border border-line hover:border-line-hover text-fg-muted hover:text-fg-secondary transition-colors"
      title={isDark ? "Switch to light" : "Switch to dark"}
    >
      {isDark ? <Sun size={16} /> : <Moon size={16} />}
    </button>
  );
}
```

- [ ] **Step 2: Update App.jsx with theme state**

Replace the entire contents of `frontend/src/App.jsx` with:

```jsx
import { useState, useEffect } from "react";
import Sidebar from "./components/Sidebar";
import ChatWindow from "./components/ChatWindow";
import { getSources } from "./hooks/useChat";

export default function App() {
  const [selectedModel, setSelectedModel] = useState(null);
  const [selectedDocIds, setSelectedDocIds] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [chatKey, setChatKey] = useState(0);

  const newChat = () => setChatKey((k) => k + 1);

  const [theme, setTheme] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("localmind-theme") || "dark";
    }
    return "dark";
  });

  useEffect(() => {
    if (theme === "light") {
      document.documentElement.classList.add("light");
    } else {
      document.documentElement.classList.remove("light");
    }
    localStorage.setItem("localmind-theme", theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === "dark" ? "light" : "dark"));
  };

  useEffect(() => {
    getSources()
      .then((data) => {
        const ids = (data.sources || []).map((s) => s.doc_id);
        setSelectedDocIds(ids);
      })
      .catch(() => setSelectedDocIds([]));
  }, []);

  return (
    <div className="flex h-screen bg-base overflow-hidden">
      <Sidebar
        selectedDocIds={selectedDocIds}
        onSelectDocIds={setSelectedDocIds}
        sidebarOpen={sidebarOpen}
        onCloseSidebar={() => setSidebarOpen(false)}
        theme={theme}
        onToggleTheme={toggleTheme}
        onNewChat={newChat}
      />
      <main className="flex-1 min-w-0">
        <ChatWindow
          key={chatKey}
          selectedModel={selectedModel}
          onSelectModel={setSelectedModel}
          selectedDocIds={selectedDocIds}
          onOpenSidebar={() => setSidebarOpen(true)}
        />
      </main>
    </div>
  );
}
```

- [ ] **Step 3: Verify build**

Run: `cd frontend && npx vite build 2>&1 | tail -5`
Expected: successful build (components not wired yet but syntax valid).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/ThemeToggle.jsx frontend/src/App.jsx
git commit -m "feat: add theme toggle and mobile sidebar state"
```

---

## Task 3: Small components — BrandLogo, TypingIndicator, SystemStatus

**Files:**
- Create: `frontend/src/components/BrandLogo.jsx`
- Create: `frontend/src/components/TypingIndicator.jsx`
- Create: `frontend/src/components/SystemStatus.jsx`

- [ ] **Step 1: Create BrandLogo.jsx**

Create `frontend/src/components/BrandLogo.jsx`:

```jsx
export default function BrandLogo({ size = "md" }) {
  const imgSize = size === "sm" ? "w-7 h-7" : "w-8 h-8";
  const titleSize = size === "sm" ? "text-sm" : "text-base";

  return (
    <div className="flex items-center gap-2.5">
      <img
        src="/logo.png"
        alt="LocalMind"
        className={`${imgSize} rounded-lg object-cover`}
      />
      <div className="flex flex-col leading-none">
        <span className={`font-display font-semibold text-fg ${titleSize} tracking-tight`}>
          LocalMind
        </span>
        <span className="font-mono text-[9px] text-fg-muted mt-0.5">v2.0.0</span>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create TypingIndicator.jsx**

Create `frontend/src/components/TypingIndicator.jsx`:

```jsx
export default function TypingIndicator() {
  return (
    <div className="flex items-center gap-1.5 px-1 py-2">
      <span className="w-2 h-2 bg-accent rounded-full animate-bounce [animation-delay:-0.3s]" />
      <span className="w-2 h-2 bg-accent rounded-full animate-bounce [animation-delay:-0.15s]" />
      <span className="w-2 h-2 bg-accent rounded-full animate-bounce" />
    </div>
  );
}
```

- [ ] **Step 3: Create SystemStatus.jsx**

Create `frontend/src/components/SystemStatus.jsx`:

```jsx
export default function SystemStatus({ model, vectorCount, avgLatency }) {
  const rows = [
    { label: "model", value: model || "—" },
    { label: "reranker", value: "bge-reranker" },
    { label: "vectors", value: vectorCount != null ? `${vectorCount} indexed` : "—" },
    { label: "latency", value: avgLatency ? `~${avgLatency}ms` : "—" },
  ];

  return (
    <div className="flex flex-col gap-1.5 font-mono text-[10px]">
      {rows.map((row) => (
        <div key={row.label} className="flex justify-between">
          <span className="text-fg-muted">{row.label}</span>
          <span className="text-fg-secondary">{row.value}</span>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Verify build**

Run: `cd frontend && npx vite build 2>&1 | tail -5`
Expected: successful build.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/BrandLogo.jsx frontend/src/components/TypingIndicator.jsx frontend/src/components/SystemStatus.jsx
git commit -m "feat: add BrandLogo, TypingIndicator, SystemStatus components"
```

---

## Task 4: ChatInput.jsx

**Files:**
- Create: `frontend/src/components/ChatInput.jsx`

- [ ] **Step 1: Create ChatInput.jsx**

Create `frontend/src/components/ChatInput.jsx`:

```jsx
import { useState, useRef, useEffect } from "react";
import { ArrowUp, Square } from "lucide-react";
import ModelSelector from "./ModelSelector";

export default function ChatInput({
  onSend,
  onStop,
  streaming,
  selectedModel,
  onSelectModel,
  selectedDocIds,
}) {
  const [input, setInput] = useState("");
  const textareaRef = useRef(null);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 168) + "px";
  }, [input]);

  const handleSend = () => {
    const q = input.trim();
    if (!q || streaming) return;
    onSend(q);
    setInput("");
  };

  const onKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const docCount = selectedDocIds?.length || 0;

  return (
    <div className="px-6 pb-5 pt-2 bg-base">
      <div className="max-w-[740px] mx-auto">
        <div className="flex items-center gap-3 bg-surface border border-line rounded-2xl px-4 py-3 focus-within:border-accent/30 transition-colors">
          <span className="font-mono text-accent text-sm shrink-0">&gt;</span>
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Ask a question..."
            rows={1}
            className="flex-1 resize-none bg-transparent text-fg placeholder:text-fg-muted text-sm outline-none font-sans leading-relaxed"
          />
          <div className="flex items-center gap-2 shrink-0">
            <span className="hidden sm:block font-mono text-[10px] text-fg-muted">
              {docCount > 0 ? `${docCount} doc${docCount !== 1 ? "s" : ""}` : "all docs"}
            </span>
            {streaming ? (
              <button
                onClick={onStop}
                className="w-8 h-8 rounded-lg border border-accent/30 bg-accent/10 text-accent flex items-center justify-center hover:bg-accent/15 transition-colors"
                title="Stop"
              >
                <Square size={14} />
              </button>
            ) : (
              <button
                onClick={handleSend}
                disabled={!input.trim()}
                className="w-8 h-8 rounded-lg border border-accent/30 bg-accent/10 text-accent flex items-center justify-center hover:bg-accent/15 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                title="Send"
              >
                <ArrowUp size={16} />
              </button>
            )}
          </div>
        </div>
        <div className="flex items-center justify-between mt-2">
          <ModelSelector selected={selectedModel} onSelect={onSelectModel} />
          <p className="font-mono text-[10px] text-fg-muted/60">
            LocalMind can make mistakes. Verify important info.
          </p>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `cd frontend && npx vite build 2>&1 | tail -5`
Expected: successful build.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/ChatInput.jsx
git commit -m "feat: add ChatInput with auto-resize textarea and stop button"
```

---

## Task 5: MessageActions.jsx

**Files:**
- Create: `frontend/src/components/MessageActions.jsx`

- [ ] **Step 1: Create MessageActions.jsx**

Create `frontend/src/components/MessageActions.jsx`:

```jsx
import { useState } from "react";
import { Copy, Check, RotateCcw } from "lucide-react";

export default function MessageActions({ content, latencyMs, onRetry }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  return (
    <div className="flex items-center gap-1.5 mt-3">
      <button
        onClick={handleCopy}
        className="flex items-center gap-1.5 px-2.5 py-1 border border-line rounded-md text-fg-muted hover:text-fg-secondary hover:border-line-hover text-xs transition-colors font-sans"
      >
        {copied ? <Check size={12} /> : <Copy size={12} />}
        {copied ? "Copied" : "Copy"}
      </button>
      {onRetry && (
        <button
          onClick={onRetry}
          className="flex items-center gap-1.5 px-2.5 py-1 border border-line rounded-md text-fg-muted hover:text-fg-secondary hover:border-line-hover text-xs transition-colors font-sans"
        >
          <RotateCcw size={12} />
          Retry
        </button>
      )}
      {latencyMs != null && (
        <span className="ml-auto font-mono text-[10px] text-fg-muted">
          latency: <span className="text-accent">{latencyMs}ms</span>
        </span>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `cd frontend && npx vite build 2>&1 | tail -5`
Expected: successful build.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/MessageActions.jsx
git commit -m "feat: add MessageActions with copy, retry, latency badge"
```

---

## Task 6: SourceGrid.jsx + SourceCard.jsx redesign

**Files:**
- Create: `frontend/src/components/SourceGrid.jsx`
- Modify: `frontend/src/components/SourceCard.jsx`

- [ ] **Step 1: Create SourceGrid.jsx**

Create `frontend/src/components/SourceGrid.jsx`:

```jsx
import SourceCard from "./SourceCard";

export default function SourceGrid({ sources }) {
  if (!sources || sources.length === 0) return null;

  return (
    <div className="mt-4">
      <div className="font-mono text-[9px] font-semibold uppercase tracking-wider text-fg-muted mb-2.5">
        // retrieved sources
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {sources.map((s, i) => (
          <SourceCard key={i} index={i + 1} {...s} />
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Rewrite SourceCard.jsx**

Replace the entire contents of `frontend/src/components/SourceCard.jsx` with:

```jsx
import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

export default function SourceCard({ index, filename, chunk_index, content, score }) {
  const [open, setOpen] = useState(false);

  const snippet = content.length > 100 ? content.slice(0, 100) + "..." : content;

  return (
    <div
      className="bg-surface border border-line rounded-lg p-3 cursor-pointer hover:border-accent/20 transition-colors"
      onClick={() => setOpen(!open)}
    >
      <div className="flex items-center gap-2 mb-1.5">
        <span className="font-mono text-[10px] font-bold text-accent bg-accent/10 px-1.5 py-0.5 rounded">
          [{index}]
        </span>
        <span className="text-fg-secondary text-xs font-medium truncate">{filename}</span>
        {score != null && (
          <span className="ml-auto font-mono text-[10px] text-fg-muted shrink-0">
            {score.toFixed(2)}
          </span>
        )}
      </div>
      <p className="text-fg-muted text-[11px] leading-relaxed font-sans">
        {open ? content : snippet}
      </p>
      {open && (
        <div className="mt-2 pt-2 border-t border-line">
          <span className="font-mono text-[10px] text-fg-muted">chunk {chunk_index}</span>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Verify build**

Run: `cd frontend && npx vite build 2>&1 | tail -5`
Expected: successful build.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/SourceGrid.jsx frontend/src/components/SourceCard.jsx
git commit -m "feat: add SourceGrid and redesign SourceCard with snippet previews"
```

---

## Task 7: MessageBubble.jsx with markdown rendering

**Files:**
- Modify: `frontend/src/components/MessageBubble.jsx`

- [ ] **Step 1: Rewrite MessageBubble.jsx**

Replace the entire contents of `frontend/src/components/MessageBubble.jsx` with:

```jsx
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import SourceGrid from "./SourceGrid";
import MessageActions from "./MessageActions";

export default function MessageBubble({
  role,
  content,
  sources = [],
  latencyMs,
  onRetry,
}) {
  const isUser = role === "user";

  if (isUser) {
    return (
      <div className="flex justify-end mb-7">
        <div className="max-w-[75%]">
          <div className="font-mono text-[10px] font-semibold uppercase tracking-wider text-fg-muted mb-1.5">
            &gt; query
          </div>
          <div className="text-fg text-lg font-normal leading-snug">
            {content}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mb-7">
      <div className="font-mono text-[10px] font-semibold uppercase tracking-wider text-accent mb-2.5">
        &gt; response
      </div>
      <div className="text-fg-secondary leading-[1.8] text-[14.5px] font-sans prose-invert max-w-none">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            p: ({ children }) => <p className="mb-3">{children}</p>,
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
            code: ({ inline, children }) =>
              inline ? (
                <code className="font-mono bg-elevated text-accent px-1.5 py-0.5 rounded text-[12px] border border-line">
                  {children}
                </code>
              ) : (
                <pre className="bg-elevated border border-line rounded-lg p-3 overflow-x-auto my-3">
                  <code className="font-mono text-[12px] text-accent">{children}</code>
                </pre>
              ),
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
            sup: ({ children }) => (
              <sup className="font-mono text-accent text-[9px] font-semibold border border-accent/25 px-1 py-px rounded ml-0.5 cursor-pointer hover:bg-accent/10 align-super">
                {children}
              </sup>
            ),
          }}
        >
          {content}
        </ReactMarkdown>
      </div>
      {sources.length > 0 && <SourceGrid sources={sources} />}
      {(content || sources.length > 0) && (
        <MessageActions content={content} latencyMs={latencyMs} onRetry={onRetry} />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `cd frontend && npx vite build 2>&1 | tail -5`
Expected: successful build.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/MessageBubble.jsx
git commit -m "feat: add markdown rendering and citation styling to MessageBubble"
```

---

## Task 8: ScrollToBottom.jsx + useChat.js abort support

**Files:**
- Create: `frontend/src/components/ScrollToBottom.jsx`
- Modify: `frontend/src/hooks/useChat.js`

- [ ] **Step 1: Create ScrollToBottom.jsx**

Create `frontend/src/components/ScrollToBottom.jsx`:

```jsx
import { ArrowDown } from "lucide-react";

export default function ScrollToBottom({ onClick }) {
  return (
    <button
      onClick={onClick}
      className="absolute bottom-32 left-1/2 -translate-x-1/2 w-9 h-9 rounded-full bg-surface border border-line text-fg-secondary flex items-center justify-center shadow-lg hover:text-accent hover:border-accent/30 transition-colors z-10"
      title="Scroll to bottom"
    >
      <ArrowDown size={16} />
    </button>
  );
}
```

- [ ] **Step 2: Update queryStream in useChat.js to support AbortSignal**

In `frontend/src/hooks/useChat.js`, replace the `queryStream` function (lines 44-89) with:

```javascript
export async function queryStream(
  question,
  { history, model, doc_ids },
  onChunk,
  onDone,
  onError,
  signal
) {
  try {
    const res = await fetch(`${API_BASE}/query/stream`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question, history, model, doc_ids }),
      signal,
    });

    if (!res.ok) {
      throw new Error("Stream request failed");
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop();

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          const data = line.slice(6);
          if (data === "[DONE]") {
            onDone();
            return;
          }
          onChunk(data);
        }
      }
    }
    onDone();
  } catch (err) {
    if (err.name !== "AbortError") {
      onError(err);
    }
  }
}
```

- [ ] **Step 3: Verify build**

Run: `cd frontend && npx vite build 2>&1 | tail -5`
Expected: successful build.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/ScrollToBottom.jsx frontend/src/hooks/useChat.js
git commit -m "feat: add ScrollToBottom button and AbortSignal support to queryStream"
```

---

## Task 9: Rewrite Sidebar.jsx — Carbon + new components + mobile drawer

**Files:**
- Modify: `frontend/src/components/Sidebar.jsx`

- [ ] **Step 1: Rewrite Sidebar.jsx**

Replace the entire contents of `frontend/src/components/Sidebar.jsx` with:

```jsx
import { useState, useEffect } from "react";
import { RefreshCw, Trash2, FileText, AlertCircle, Plus, X } from "lucide-react";
import { getSources, deleteSource } from "../hooks/useChat";
import FileUploader from "./FileUploader";
import BrandLogo from "./BrandLogo";
import SystemStatus from "./SystemStatus";
import ThemeToggle from "./ThemeToggle";

export default function Sidebar({
  selectedDocIds,
  onSelectDocIds,
  sidebarOpen,
  onCloseSidebar,
  theme,
  onToggleTheme,
  onNewChat,
}) {
  const [sources, setSources] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [deleting, setDeleting] = useState(null);

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getSources();
      setSources(data.sources || []);
    } catch {
      setError("Failed to load sources");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const handleDelete = async (docId) => {
    setDeleting(docId);
    try {
      await deleteSource(docId);
      setSources((prev) => prev.filter((s) => s.doc_id !== docId));
    } catch {
      setError("Failed to delete source");
    } finally {
      setDeleting(null);
    }
  };

  const toggleDoc = (docId) => {
    if (!selectedDocIds) return;
    if (selectedDocIds.includes(docId)) {
      onSelectDocIds(selectedDocIds.filter((id) => id !== docId));
    } else {
      onSelectDocIds([...selectedDocIds, docId]);
    }
  };

  const allSelected = () => {
    if (!selectedDocIds || sources.length === 0) return false;
    return sources.every((s) => selectedDocIds.includes(s.doc_id));
  };

  const toggleAll = () => {
    if (allSelected()) {
      onSelectDocIds([]);
    } else {
      onSelectDocIds(sources.map((s) => s.doc_id));
    }
  };

  const totalChunks = sources.reduce((sum, s) => sum + s.chunks, 0);

  return (
    <>
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30 md:hidden"
          onClick={onCloseSidebar}
        />
      )}
      <aside
        className={`w-[248px] bg-surface border-r border-line flex flex-col h-full shrink-0 z-40 transition-transform duration-200
        ${sidebarOpen ? "fixed md:relative translate-x-0" : "fixed md:relative -translate-x-full md:translate-x-0"}`}
      >
        <div className="p-4 border-b border-line flex items-center justify-between">
          <BrandLogo />
          <div className="flex items-center gap-2">
            <ThemeToggle theme={theme} onToggle={onToggleTheme} />
            <button
              onClick={onCloseSidebar}
              className="md:hidden p-1.5 rounded-lg text-fg-muted hover:text-fg-secondary"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="px-3 py-2.5">
          <button
            onClick={onNewChat}
            className="w-full flex items-center gap-2 px-3 py-2 border border-line rounded-lg text-fg-secondary hover:border-accent/30 hover:text-accent text-xs font-mono transition-colors"
          >
            <Plus size={14} />
            new --chat
          </button>
        </div>

        <div className="px-4 py-1">
          <FileUploader onSuccess={refresh} />
        </div>

        {error && (
          <div className="mx-3 mb-2 flex items-center gap-1.5 text-xs text-accent bg-accent/5 border border-accent/20 rounded-md px-3 py-2">
            <AlertCircle size={12} className="shrink-0" />
            {error}
          </div>
        )}

        <div className="px-4 py-1 flex items-center justify-between">
          <span className="font-mono text-[9px] font-semibold uppercase tracking-wider text-fg-muted">
            // sources ({sources.length})
          </span>
          {sources.length > 0 && (
            <button
              onClick={toggleAll}
              className="text-[10px] font-mono text-fg-muted hover:text-accent transition-colors"
            >
              {allSelected() ? "deselect all" : "select all"}
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto px-2 pb-2">
          {sources.length === 0 && !loading ? (
            <p className="text-xs text-fg-muted text-center py-8 px-4">
              Upload documents to get started
            </p>
          ) : (
            <ul className="space-y-0.5">
              {sources.map((s) => {
                const isChecked = selectedDocIds?.includes(s.doc_id);
                return (
                  <li
                    key={s.doc_id}
                    className={`group flex items-center gap-2.5 px-2.5 py-2 rounded-lg cursor-pointer transition-colors border border-transparent
                      ${isChecked ? "bg-accent/5 hover:bg-accent/8" : "opacity-40 hover:opacity-70 hover:bg-elevated"}`}
                    onClick={() => toggleDoc(s.doc_id)}
                  >
                    <div className={`w-3.5 h-3.5 rounded shrink-0 border flex items-center justify-center transition-colors
                      ${isChecked ? "bg-accent/15 border-accent" : "border-line-hover"}`}>
                      {isChecked && (
                        <svg width="8" height="6" viewBox="0 0 8 6" fill="none">
                          <path d="M1 3L3 5L7 1" stroke="#22d3ee" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      )}
                    </div>
                    <FileText size={14} className="text-fg-muted shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-fg-secondary truncate">{s.filename}</p>
                    </div>
                    <span className="font-mono text-[10px] text-fg-muted shrink-0">{s.chunks}ch</span>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDelete(s.doc_id); }}
                      disabled={deleting === s.doc_id}
                      className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-accent/10 text-fg-muted hover:text-accent transition-all"
                    >
                      <Trash2 size={12} className={deleting === s.doc_id ? "animate-spin" : ""} />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="px-4 py-3 border-t border-line">
          <button
            onClick={refresh}
            disabled={loading}
            className="flex items-center gap-1.5 text-[10px] font-mono text-fg-muted hover:text-accent transition-colors mb-2.5"
          >
            <RefreshCw size={11} className={loading ? "animate-spin" : ""} />
            refresh
          </button>
          <SystemStatus vectorCount={totalChunks} />
        </div>
      </aside>
    </>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `cd frontend && npx vite build 2>&1 | tail -5`
Expected: successful build.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/Sidebar.jsx
git commit -m "feat: rewrite Sidebar with Carbon design, mobile drawer, brand logo, system status"
```

---

## Task 10: Rewrite ChatWindow.jsx — Carbon + all integrations

**Files:**
- Modify: `frontend/src/components/ChatWindow.jsx`

- [ ] **Step 1: Rewrite ChatWindow.jsx**

Replace the entire contents of `frontend/src/components/ChatWindow.jsx` with:

```jsx
import { useState, useRef, useEffect } from "react";
import { Menu, AlertCircle } from "lucide-react";
import MessageBubble from "./MessageBubble";
import ChatInput from "./ChatInput";
import TypingIndicator from "./TypingIndicator";
import ScrollToBottom from "./ScrollToBottom";
import BrandLogo from "./BrandLogo";
import { queryStream } from "../hooks/useChat";

const MAX_HISTORY_TURNS = 5;

const SUGGESTED_PROMPTS = [
  "What is RAG?",
  "Summarize my documents",
  "What are embeddings?",
];

export default function ChatWindow({
  selectedModel,
  onSelectModel,
  selectedDocIds,
  onOpenSidebar,
}) {
  const [messages, setMessages] = useState([]);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState(null);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const scrollRef = useRef(null);
  const bottomRef = useRef(null);
  const abortRef = useRef(null);
  const lastQueryRef = useRef(null);
  const latencyRef = useRef(0);

  const scrollToBottom = () => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 100;
    setShowScrollBtn(!atBottom && messages.length > 0);
  };

  useEffect(() => {
    if (!showScrollBtn) scrollToBottom();
  }, [messages]);

  const handleSend = async (question) => {
    setError(null);

    const history = messages
      .slice(-MAX_HISTORY_TURNS * 2)
      .map((m) => ({ role: m.role, content: m.content }));

    setMessages((prev) => [...prev, { role: "user", content: question }]);
    setStreaming(true);

    let assistantContent = "";
    setMessages((prev) => [
      ...prev,
      { role: "assistant", content: "", sources: [] },
    ]);

    const controller = new AbortController();
    abortRef.current = controller;
    lastQueryRef.current = { question, history, model: selectedModel, doc_ids: selectedDocIds };
    latencyRef.current = Date.now();

    await queryStream(
      question,
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
      },
      (err) => {
        setStreaming(false);
        if (!assistantContent) {
          setError("Failed to get a response. Please try again.");
          setMessages((prev) => prev.slice(0, -1));
        }
      },
      controller.signal
    );
  };

  const handleStop = () => {
    abortRef.current?.abort();
    setStreaming(false);
  };

  const handleRetry = () => {
    if (!lastQueryRef.current) return;
    const { question, history, model, doc_ids } = lastQueryRef.current;
    setMessages((prev) => {
      const withoutLast = prev.slice(0, -1);
      return withoutLast;
    });
    handleSend(question);
  };

  const lastMsg = messages[messages.length - 1];
  const waitingForFirstToken =
    streaming && lastMsg?.role === "assistant" && !lastMsg.content;

  return (
    <div className="flex flex-col h-full bg-base relative">
      <div className="md:hidden flex items-center gap-3 px-4 py-3 border-b border-line bg-surface">
        <button
          onClick={onOpenSidebar}
          className="p-1.5 rounded-lg text-fg-secondary hover:text-accent"
        >
          <Menu size={18} />
        </button>
        <BrandLogo size="sm" />
      </div>

      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto"
      >
        <div className="max-w-[740px] mx-auto px-6 md:px-9 py-8">
          {messages.length === 0 && !error && (
            <div className="flex flex-col items-center justify-center h-full gap-4 py-20">
              <img src="/logo.png" alt="LocalMind" className="w-16 h-16 rounded-xl" />
              <h2 className="text-fg text-xl font-semibold font-display">
                Ask a question about your documents
              </h2>
              <p className="text-fg-muted text-sm text-center max-w-xs">
                Upload files in the sidebar, then query your knowledge base
              </p>
              <div className="flex flex-wrap gap-2 justify-center mt-2">
                {SUGGESTED_PROMPTS.map((prompt) => (
                  <button
                    key={prompt}
                    onClick={() => handleSend(prompt)}
                    className="px-3 py-1.5 text-xs font-sans text-fg-secondary border border-line rounded-lg hover:border-accent/30 hover:text-accent transition-colors"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg, i) => (
            <MessageBubble
              key={i}
              {...msg}
              onRetry={msg.role === "assistant" && i === messages.length - 1 ? handleRetry : null}
            />
          ))}

          {waitingForFirstToken && <TypingIndicator />}

          {error && (
            <div className="flex justify-center my-4">
              <div className="flex items-center gap-2 text-accent bg-accent/5 border border-accent/20 rounded-lg px-4 py-2 text-sm">
                <AlertCircle size={16} />
                {error}
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      </div>

      {showScrollBtn && <ScrollToBottom onClick={scrollToBottom} />}

      <ChatInput
        onSend={handleSend}
        onStop={handleStop}
        streaming={streaming}
        selectedModel={selectedModel}
        onSelectModel={onSelectModel}
        selectedDocIds={selectedDocIds}
      />
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `cd frontend && npx vite build 2>&1 | tail -5`
Expected: successful build.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/ChatWindow.jsx
git commit -m "feat: rewrite ChatWindow with Carbon design, empty state, scroll logic, all integrations"
```

---

## Task 11: Restyle ModelSelector.jsx + FileUploader.jsx

**Files:**
- Modify: `frontend/src/components/ModelSelector.jsx`
- Modify: `frontend/src/components/FileUploader.jsx`

- [ ] **Step 1: Rewrite ModelSelector.jsx**

Replace the entire contents of `frontend/src/components/ModelSelector.jsx` with:

```jsx
import { useState, useEffect } from "react";
import { ChevronDown } from "lucide-react";
import { getModels } from "../hooks/useChat";

export default function ModelSelector({ selected, onSelect }) {
  const [models, setModels] = useState([]);
  const [defaultModel, setDefaultModel] = useState("");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    getModels()
      .then((data) => {
        setModels(data.models || []);
        setDefaultModel(data.default || "");
        if (!selected) {
          onSelect(data.default);
        }
      })
      .catch(() => {});
  }, []);

  const display = selected || defaultModel;
  const shortName = display.split("/").pop();

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-mono text-accent bg-accent/5 border border-line rounded-lg hover:border-accent/20 transition-colors"
      >
        {shortName}
        <ChevronDown size={11} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute bottom-full left-0 mb-1 z-20 bg-surface border border-line rounded-lg shadow-xl min-w-[240px] max-h-64 overflow-y-auto">
            {models.map((m) => (
              <button
                key={m}
                onClick={() => {
                  onSelect(m);
                  setOpen(false);
                }}
                className={`w-full text-left px-3 py-2 text-xs font-mono hover:bg-elevated transition-colors border-b border-line last:border-0
                  ${m === selected ? "text-accent font-medium" : "text-fg-secondary"}`}
              >
                {m.split("/").pop()}
                <span className="text-fg-muted ml-1.5">({m.split("/")[0]})</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Rewrite FileUploader.jsx**

Replace the entire contents of `frontend/src/components/FileUploader.jsx` with:

```jsx
import { useState, useRef } from "react";
import { UploadCloud, CheckCircle, AlertCircle } from "lucide-react";
import { uploadFiles } from "../hooks/useChat";

export default function FileUploader({ onSuccess }) {
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);
  const inputRef = useRef(null);

  const handleFiles = async (files) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    setError(null);
    setSuccessMsg(null);
    setProgress(10);

    try {
      const result = await uploadFiles(files);
      setProgress(100);
      const count = result.ingested?.length || 0;
      setSuccessMsg(`${count} file${count !== 1 ? "s" : ""} ingested`);
      setTimeout(() => setSuccessMsg(null), 3000);
      onSuccess(result);
    } catch (e) {
      setError(e.message);
      setProgress(0);
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const onDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    handleFiles(Array.from(e.dataTransfer.files));
  };

  return (
    <div>
      <div
        onDrop={onDrop}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onClick={() => !uploading && inputRef.current?.click()}
        className={`border border-dashed rounded-lg p-3 text-center cursor-pointer transition-colors
          ${dragging ? "border-accent/40 bg-accent/5" : "border-line hover:border-line-hover"}`}
      >
        <UploadCloud
          size={18}
          className={`mx-auto mb-1 ${dragging ? "text-accent" : "text-fg-muted"}`}
        />
        <p className="text-[11px] text-fg-secondary font-sans">
          {uploading ? "Uploading..." : "Drop files or click"}
        </p>
        <p className="text-[10px] text-fg-muted font-mono mt-0.5">.pdf .md .txt</p>
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.md,.txt"
          multiple
          className="hidden"
          onChange={(e) => handleFiles(Array.from(e.target.files))}
        />
      </div>

      {uploading && (
        <div className="mt-2 h-1 bg-line rounded-full overflow-hidden">
          <div
            className="h-full bg-accent rounded-full transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}

      {error && (
        <div className="mt-2 flex items-center gap-1.5 text-[11px] text-accent font-sans">
          <AlertCircle size={11} />
          {error}
        </div>
      )}

      {successMsg && (
        <div className="mt-2 flex items-center gap-1.5 text-[11px] text-green-500 font-sans">
          <CheckCircle size={11} />
          {successMsg}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Verify build**

Run: `cd frontend && npx vite build 2>&1 | tail -5`
Expected: successful build.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/ModelSelector.jsx frontend/src/components/FileUploader.jsx
git commit -m "feat: restyle ModelSelector and FileUploader with Carbon design"
```

---

## Task 12: Build verification + manual test checklist

**Files:** None (verification only)

- [ ] **Step 1: Full clean build**

Run:
```bash
cd frontend && rm -rf dist && npx vite build 2>&1
```
Expected: successful build, no errors, output in `dist/`.

- [ ] **Step 2: Verify all component imports resolve**

Run:
```bash
cd frontend && python3 -c "
import os, re
components = os.listdir('src/components')
for f in sorted(components):
    if f.endswith('.jsx'):
        print(f)
print(f'\n{len([f for f in components if f.endswith(\".jsx\")])} components total')
"
```
Expected: 13 component files (App is in src/, not components/).

- [ ] **Step 3: Manual checklist — verify in spec**

Open `docs/superpowers/specs/2026-06-13-carbon-design-system.md` section 11 and verify each item. The key checks:
- Dark mode renders with Carbon palette
- Light mode toggle works and persists
- Markdown renders (bold, code, lists) in AI responses
- Citations render as cyan badges
- Copy button works with feedback
- New chat clears conversation
- Auto-resize textarea works
- Stop button aborts streaming
- Mobile: sidebar drawer opens/closes with overlay
- Empty state shows logo + suggested prompts
- Source cards show in 2-column grid with snippets

- [ ] **Step 4: Commit any final fixes**

```bash
git add -A
git commit -m "feat: complete Carbon design system — full UI redesign"
```
