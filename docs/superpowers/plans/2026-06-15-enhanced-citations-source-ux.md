# Enhanced Citations & Source UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve the source/citation experience with score visualization, hover tooltips, document navigation, and source grouping.

**Architecture:** All changes are frontend-only (React components). Three new components (`ScoreBar`, `SourceTooltip`, `SourceGroup`), three modified components (`SourceCard`, `SourceGrid`, `CitationBadge`). No backend changes.

**Tech Stack:** React 19, Tailwind CSS, Lucide icons, existing Carbon design tokens (CSS variables).

---

### Task 1: ScoreBar Component

**Files:**
- Create: `frontend/src/components/ScoreBar.jsx`

- [ ] **Step 1: Create ScoreBar.jsx**

```jsx
export default function ScoreBar({ score, compact = false }) {
  const safeScore = score ?? 0;
  const pct = Math.round(safeScore * 100);
  const barColor = pct >= 70 ? "bg-emerald-400" : pct >= 40 ? "bg-amber-400" : "bg-fg-muted";
  const labelColor = pct >= 70 ? "text-emerald-400" : pct >= 40 ? "text-amber-400" : "text-fg-muted";

  return (
    <div
      className="flex items-center gap-1.5"
      role="img"
      aria-label={`${pct}% relevant`}
    >
      <div className={`flex-1 ${compact ? "h-[3px]" : "h-1"} bg-elevated rounded-full overflow-hidden`}>
        <div
          className={`h-full ${barColor} rounded-full transition-all`}
          style={{ width: `${pct}%` }}
        />
      </div>
      {!compact && (
        <span className={`font-mono text-[10px] ${labelColor} shrink-0`}>{pct}%</span>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify no import errors**

Run: `cd frontend && npx vite build --logLevel error 2>&1 | head -20`
Expected: No errors related to ScoreBar.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/ScoreBar.jsx
git commit -m "feat(c6): add ScoreBar component for relevance score visualization"
```

---

### Task 2: Modify SourceCard — div + ScoreBar + View in Document

**Files:**
- Modify: `frontend/src/components/SourceCard.jsx`

- [ ] **Step 1: Replace SourceCard.jsx with updated version**

Key changes:
- Outer element: `<button>` → `<div role="button" tabIndex={0}>` with keyboard handler (avoids nested-button HTML violation)
- New props: `doc_id`, `onViewDocument`
- Score: raw `{score.toFixed(2)}` → `<ScoreBar score={score} />`
- Expanded state: new "View full document" button with `e.stopPropagation()`

```jsx
import { useState } from "react";
import { ExternalLink } from "lucide-react";
import ScoreBar from "./ScoreBar";

export default function SourceCard({ index, doc_id, filename, chunk_index, content, score, onViewDocument }) {
  const [open, setOpen] = useState(false);

  const snippet = content.length > 100 ? content.slice(0, 100) + "\u2026" : content;

  const handleKeyDown = (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setOpen(!open);
    }
  };

  return (
    <div
      id={`source-${index}`}
      role="button"
      tabIndex={0}
      className="w-full text-left bg-surface border border-line rounded-lg p-3 cursor-pointer hover:border-accent/20 transition-all focus:outline-none focus:ring-1 focus:ring-accent/40"
      onClick={() => setOpen(!open)}
      onKeyDown={handleKeyDown}
      aria-expanded={open}
      aria-label={`Source ${index}: ${filename}${open ? " (expanded)" : ""}`}
    >
      <div className="flex items-center gap-2 mb-1.5">
        <span className="font-mono text-[10px] font-bold text-accent bg-accent/10 px-1.5 py-0.5 rounded shrink-0">
          [{index}]
        </span>
        <span className="text-fg-secondary text-xs font-medium truncate flex-1">{filename}</span>
        {score != null && (
          <div className="w-24 shrink-0">
            <ScoreBar score={score} />
          </div>
        )}
      </div>
      <p className="text-fg-muted text-[11px] leading-relaxed font-sans">
        {open ? content : snippet}
      </p>
      {open && (
        <div className="mt-2 pt-2 border-t border-line">
          <span className="font-mono text-[10px] text-fg-muted">chunk {chunk_index}</span>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onViewDocument?.(doc_id, filename);
            }}
            className="mt-2 flex items-center gap-1 text-accent text-[11px] hover:underline"
            aria-label={`View full document: ${filename}`}
          >
            <ExternalLink size={11} aria-hidden="true" />
            View full document
          </button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `cd frontend && npx vite build --logLevel error 2>&1 | head -20`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/SourceCard.jsx
git commit -m "feat(c6): SourceCard — div restructure, ScoreBar, view-in-document link"
```

---

### Task 3: SourceTooltip Component

**Files:**
- Create: `frontend/src/components/SourceTooltip.jsx`

- [ ] **Step 1: Create SourceTooltip.jsx**

Wraps children (the citation badge button). Shows floating card on hover (300ms delay) or keyboard focus.

```jsx
import { useState, useRef } from "react";
import ScoreBar from "./ScoreBar";

export default function SourceTooltip({ index, source, children }) {
  const [show, setShow] = useState(false);
  const timerRef = useRef(null);

  const handleEnter = () => {
    timerRef.current = setTimeout(() => setShow(true), 300);
  };

  const handleLeave = () => {
    clearTimeout(timerRef.current);
    setShow(false);
  };

  const snippet = source?.content
    ? source.content.length > 150
      ? source.content.slice(0, 150) + "\u2026"
      : source.content
    : "No preview available";

  return (
    <span
      className="relative inline-block"
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
      onFocus={() => setShow(true)}
      onBlur={handleLeave}
    >
      {children}
      {show && source && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-[280px] bg-surface border border-line rounded-lg p-3 shadow-xl z-40 pointer-events-none">
          <div className="flex items-center gap-2 mb-2">
            <span className="font-mono text-[10px] font-bold text-accent bg-accent/10 px-1.5 py-0.5 rounded shrink-0">
              [{index}]
            </span>
            <span className="text-fg-secondary text-xs font-medium truncate flex-1">
              {source.filename}
            </span>
          </div>
          <ScoreBar score={source.score} compact />
          <p className="text-fg-muted text-[11px] leading-relaxed mt-1.5">{snippet}</p>
          <div className="mt-2 pt-1.5 border-t border-line">
            <span className="font-mono text-[9px] text-fg-muted">Click to jump to source</span>
          </div>
          <div className="absolute left-1/2 -translate-x-1/2 -bottom-[5px] w-2.5 h-2.5 bg-surface border-r border-b border-line rotate-45" />
        </div>
      )}
    </span>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `cd frontend && npx vite build --logLevel error 2>&1 | head -20`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/SourceTooltip.jsx
git commit -m "feat(c6): add SourceTooltip — hover/focus preview on citation badges"
```

---

### Task 4: Modify CitationBadge — Wrap with SourceTooltip

**Files:**
- Modify: `frontend/src/components/CitationBadge.jsx`

- [ ] **Step 1: Update CitationBadge.jsx**

Wrap the existing `<button>` inside `<SourceTooltip>`. The tooltip receives the source data from `sources[index - 1]`. Click behavior unchanged.

```jsx
import SourceTooltip from "./SourceTooltip";

export default function CitationBadge({ index, sources }) {
  const source = sources[index - 1];

  if (!source) return <span className="text-fg-muted">[{index}]</span>;

  return (
    <sup>
      <SourceTooltip index={index} source={source}>
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
      </SourceTooltip>
    </sup>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `cd frontend && npx vite build --logLevel error 2>&1 | head -20`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/CitationBadge.jsx
git commit -m "feat(c6): wrap citation badges with hover tooltip"
```

---

### Task 5: SourceGroup Component

**Files:**
- Create: `frontend/src/components/SourceGroup.jsx`

- [ ] **Step 1: Create SourceGroup.jsx**

A collapsible group of source chunks from the same document. Uses `globalIndices` (0-based positions in the original sources array) so citation numbering `[N]` stays stable after grouping.

```jsx
import { useState } from "react";
import { FileText, ChevronDown } from "lucide-react";
import SourceCard from "./SourceCard";
import ScoreBar from "./ScoreBar";

export default function SourceGroup({ filename, chunks, globalIndices, defaultOpen, onViewDocument }) {
  const [open, setOpen] = useState(defaultOpen);
  const bestScore = Math.max(...chunks.map((c) => c.score || 0));

  return (
    <div className="border border-line rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="w-full flex items-center gap-2 px-3 py-2 bg-elevated/50 hover:bg-elevated transition-colors"
      >
        <FileText size={14} className="text-accent shrink-0" aria-hidden="true" />
        <span className="text-fg-secondary text-xs font-medium truncate flex-1 text-left">
          {filename}
        </span>
        <span className="font-mono text-[10px] text-fg-muted shrink-0">
          {chunks.length} {chunks.length === 1 ? "chunk" : "chunks"}
        </span>
        <div className="w-14 shrink-0">
          <ScoreBar score={bestScore} compact />
        </div>
        <ChevronDown
          size={14}
          className={`text-fg-muted shrink-0 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
          aria-hidden="true"
        />
      </button>
      {open && (
        <div className="flex flex-col gap-2 p-2">
          {chunks.map((chunk, i) => (
            <SourceCard
              key={globalIndices[i]}
              index={globalIndices[i] + 1}
              doc_id={chunk.doc_id}
              filename={chunk.filename}
              chunk_index={chunk.chunk_index}
              content={chunk.content}
              score={chunk.score}
              onViewDocument={onViewDocument}
            />
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `cd frontend && npx vite build --logLevel error 2>&1 | head -20`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/SourceGroup.jsx
git commit -m "feat(c6): add SourceGroup — collapsible source chunks grouped by document"
```

---

### Task 6: Modify SourceGrid — Grouping Logic + DocumentPreview Wiring

**Files:**
- Modify: `frontend/src/components/SourceGrid.jsx`

- [ ] **Step 1: Replace SourceGrid.jsx with updated version**

Key changes:
- Group sources by `doc_id` using `useMemo`
- If any group has 2+ chunks → grouped mode (SourceGroup components). Otherwise flat mode (existing grid).
- Groups sorted by best score descending. Chunks within group sorted by `chunk_index`.
- Global indices preserved so citation numbering `[N]` stays stable.
- `DocumentPreview` modal managed locally: `previewDoc` state.

```jsx
import { useState, useMemo } from "react";
import SourceCard from "./SourceCard";
import SourceGroup from "./SourceGroup";
import DocumentPreview from "./DocumentPreview";

export default function SourceGrid({ sources }) {
  const [previewDoc, setPreviewDoc] = useState(null);

  const groups = useMemo(() => {
    const map = new Map();
    sources.forEach((s, i) => {
      if (!map.has(s.doc_id)) {
        map.set(s.doc_id, { filename: s.filename, chunks: [], globalIndices: [] });
      }
      const group = map.get(s.doc_id);
      group.chunks.push(s);
      group.globalIndices.push(i);
    });
    const groupArray = Array.from(map.values());
    groupArray.forEach((g) => {
      g.bestScore = Math.max(...g.chunks.map((c) => c.score || 0));
      g.chunks.sort((a, b) => a.chunk_index - b.chunk_index);
    });
    groupArray.sort((a, b) => b.bestScore - a.bestScore);
    return groupArray;
  }, [sources]);

  const needsGrouping = groups.some((g) => g.chunks.length > 1);

  const handleViewDocument = (docId, filename) => {
    setPreviewDoc({ docId, filename });
  };

  if (!sources || sources.length === 0) return null;

  return (
    <>
      <div className="mt-4">
        <div className="font-mono text-[9px] font-semibold uppercase tracking-wider text-fg-muted mb-2.5">
          // retrieved sources
        </div>
        {needsGrouping ? (
          <div className="flex flex-col gap-2">
            {groups.map((group, gi) => (
              <SourceGroup
                key={group.globalIndices[0]}
                filename={group.filename}
                chunks={group.chunks}
                globalIndices={group.globalIndices}
                defaultOpen={gi === 0}
                onViewDocument={handleViewDocument}
              />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {sources.map((s, i) => (
              <SourceCard
                key={i}
                index={i + 1}
                {...s}
                onViewDocument={handleViewDocument}
              />
            ))}
          </div>
        )}
      </div>
      {previewDoc && (
        <DocumentPreview
          docId={previewDoc.docId}
          filename={previewDoc.filename}
          onClose={() => setPreviewDoc(null)}
        />
      )}
    </>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `cd frontend && npx vite build --logLevel error 2>&1 | head -20`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/SourceGrid.jsx
git commit -m "feat(c6): SourceGrid — document grouping, DocumentPreview wiring"
```

---

### Task 7: Manual Testing & Final Verification

- [ ] **Step 1: Start backend and frontend dev servers**

```bash
# Terminal 1 — backend
cd backend && python main.py

# Terminal 2 — frontend
cd frontend && npm run dev
```

- [ ] **Step 2: Test score visualization**

- Upload a document, ask a question
- Verify ScoreBar appears in each source card header (replaces raw number)
- Verify bar color: green for high scores, amber for mid, gray for low
- Verify percentage label shows to the right of bar

- [ ] **Step 3: Test hover tooltip on citations**

- Ask a question that generates `[1]`, `[2]` citations in the answer
- Hover over a `[1]` badge → verify tooltip appears after ~300ms delay
- Verify tooltip shows: index, filename, score bar, snippet (~150 chars), "Click to jump to source"
- Move mouse away → tooltip disappears immediately
- Tab to a citation badge → tooltip appears on focus, disappears on blur

- [ ] **Step 4: Test citation click still works**

- Click a `[1]` badge → verify scroll to source card + highlight pulse (ring-2 ring-accent)
- Verify this still works after all changes

- [ ] **Step 5: Test "View full document"**

- Expand a source card (click it)
- Verify "View full document" button appears with ExternalLink icon
- Click it → verify DocumentPreview modal opens with correct content
- Close modal → verify return to chat

- [ ] **Step 6: Test source grouping**

- Upload 2+ documents, ask a question that retrieves multiple chunks from same document
- Verify grouped mode: collapsible headers with filename, chunk count, best score bar
- Verify first group auto-expanded, rest collapsed
- Click a group header → verify expand/collapse with chevron rotation
- Verify citation numbering `[1]`, `[2]`, etc. still maps correctly after grouping
- Ask a question that retrieves chunks from different documents → verify flat mode (no group headers)

- [ ] **Step 7: Test keyboard accessibility**

- Tab through source cards → verify focus ring
- Press Enter/Space on a focused source card → verify expand toggle
- Verify aria-expanded updates on group headers and source cards

- [ ] **Step 8: Final commit (if any fixes were needed)**

If any fixes were applied during testing:
```bash
git add -A
git commit -m "fix(c6): address issues found during manual testing"
```
