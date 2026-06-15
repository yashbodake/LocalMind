# C6 — Enhanced Citations & Source UX

## Date
2026-06-15

## Status
Approved

## Context
The current source/citation experience has four gaps identified in the gap analysis:

1. **No hover preview** — Users must click `[N]` and scroll to see what a citation references. There is no quick glance at the source content.
2. **No "View in document"** — When a user finds a useful source chunk, there is no way to jump to the full document. The `DocumentPreview` modal exists (from C4) but is only accessible from the Sidebar source list, not from within a chat response.
3. **Raw score number** — Relevance is shown as a raw float like `0.8234`. Non-technical users cannot quickly gauge source quality at a glance.
4. **Flat source list** — When the retriever returns 5 chunks and 3 come from the same document, they appear as 5 separate cards with repeated filenames. No visual grouping signals that multiple results are from the same source document.

All four features are frontend-only. The backend `SourceChunk` schema already returns `doc_id`, `filename`, `chunk_index`, `content`, and `score` — everything needed.

## Scope

### In Scope
- Hover tooltip on `[N]` citation badges showing source snippet
- "View full document" link in expanded source cards → opens DocumentPreview modal
- Relevance score visualization (color-coded progress bar replacing raw number)
- Source grouping by document (collapsible groups when 2+ chunks from same doc)

### Out of Scope
- Backend changes to retrieval or scoring
- Source relevance tooltips on hover of source cards themselves (only citation badges)
- Highlighting matched text within source content
- Backend full-text search within documents

## Design

### New Components

#### 1. `ScoreBar.jsx`
A reusable horizontal progress bar that visualizes a similarity score (0.0–1.0).

**Props:**
- `score: number` — similarity score, 0.0 to 1.0
- `compact?: boolean` — when true, renders a smaller variant (for tooltips)

**Behavior:**
- Width fills proportionally to score (e.g., 0.82 → 82% width)
- Color thresholds:
  - `>= 0.7` → emerald (`bg-emerald-400`)
  - `0.4 – 0.69` → amber (`bg-amber-400`)
  - `< 0.4` → gray (`bg-fg-muted`)
- Bar height: 4px standard, 3px compact
- Percentage label (`82%`) shown to the right in mono font, 10px — hidden in compact mode (compact shows bar only, no label, to save space in tooltips and group headers)

#### 2. `SourceTooltip.jsx`
Wraps a citation badge and shows a floating preview card on hover/focus.

**Props:**
- `index: number` — citation index (1-based)
- `source: SourceChunk` — the source data `{ doc_id, filename, chunk_index, content, score }`

**Behavior:**
- Appears 300ms after mouse enter (prevents accidental triggers)
- Disappears immediately on mouse leave
- Shows on keyboard focus (accessibility)
- Positioned absolutely above the badge, centered
- Contents:
  - Header: `[N] filename.pdf` (index badge + truncated filename)
  - ScoreBar (compact)
  - Snippet: first 150 chars of content + ellipsis
  - Footer hint: "Click to jump to source"
- Max width: 280px
- Styled as a floating card: `bg-surface`, `border border-line`, `shadow-xl`, `rounded-lg`, `p-3`
- Has a small pointer/arrow at the bottom center pointing to the badge
- Uses `z-40` (below modals which use `z-50`)
- Does NOT block the click handler — clicking still scrolls to the source card

**Known limitation:** Tooltip is always positioned above the badge. If a citation badge is in the first line of an answer near the top of the viewport, the tooltip may clip off-screen. Acceptable for v1 — dynamic repositioning can be added later if needed.

**Implementation detail:**
- Uses a wrapper `<span className="relative inline-block">` around the citation button
- Tooltip is a child `<div>` toggled by `onMouseEnter`/`onMouseLeave`/`onFocus`/`onBlur` state
- 300ms delay implemented via `setTimeout` in `onMouseEnter`, cleared on `onMouseLeave`

#### 3. `SourceGroup.jsx`
A collapsible group of source chunks from the same document.

**Props:**
- `filename: string` — the document filename
- `chunks: SourceChunk[]` — chunks belonging to this document
- `startIndex: number` — the global citation index of the first chunk (for numbering `[N]`)
- `defaultOpen: boolean` — whether the group starts expanded
- `onViewDocument: (docId: string, filename: string) => void` — callback to open DocumentPreview

**Behavior:**
- Collapsible header:
  - File icon (lucide `FileText`, 14px)
  - Filename (truncated, `text-fg-secondary`, `text-xs font-medium`)
  - Chunk count badge (`2 chunks` in mono font, `text-fg-muted`)
  - Best score (highest score among chunks) shown as compact ScoreBar
  - Chevron icon (`ChevronDown` / `ChevronUp`, lucide, 14px) for expand/collapse
- Body (when expanded):
  - Single-column stack of `SourceCard` components, one per chunk (`flex flex-col gap-2`)
  - Each card shows its own index `[N]`, ScoreBar, snippet, expand, and "View in document"
  - Single-column (not 2-col grid) because cards within a group share the same filename — a vertical stack reads more naturally as "sections of the same document"

**Click target:** The entire header row toggles collapse. Chevron rotates 180° when expanded.

**Edge case — single-chunk groups in grouped mode:** When grouped mode triggers (because doc A has 3 chunks), doc B with only 1 chunk still renders inside a `SourceGroup` wrapper. This is intentional — mixing grouped and flat cards would create inconsistent visual rhythm. The single-chunk group still shows its header for consistency.

### Modified Components

#### 4. `SourceCard.jsx` (modified)
**Breaking change — restructure outer element:** The current SourceCard renders the entire card as a `<button>`. Since we need to place a "View full document" button inside the expanded card body, we must convert the outer element from `<button>` to a `<div>` with keyboard handling to avoid invalid nested-button HTML.

**Changes:**
- Outer element: `<div>` with `role="button"`, `tabIndex={0}`, `onClick`, and `onKeyDown` (Enter/Space triggers expand toggle). Retains the same `id`, classes, and `aria-expanded`.
- Destructure new prop: `doc_id` (already present via `{...s}` spread from SourceGrid — added to destructured props alongside existing `chunk_index`, following the codebase's snake_case convention)
- Replace `{score.toFixed(2)}` raw number with `<ScoreBar score={score} />` in the header
- When expanded (`open === true`), add a "View full document" button below the chunk content:
  ```
  [icon ExternalLink] View full document →
  ```
  - Rendered as a `<button>` element
  - Styled as a subtle text link: `text-accent text-[11px] hover:underline`
  - Calls `onViewDocument(docId, filename)` prop
  - Must call `e.stopPropagation()` to prevent triggering the outer div's onClick (which toggles expand)
- Add new prop: `onViewDocument: (docId: string, filename: string) => void`

**Note on click behavior:** Clicking anywhere in the expanded body (including selecting text) will toggle collapse since the entire card has `onClick`. This is consistent with the current behavior and acceptable for v1.

**Unchanged:** Index badge, filename display, snippet/expand behavior, chunk_index footer.

#### 5. `SourceGrid.jsx` (modified)
**Changes:**
- Determine if grouping is needed: group sources by `doc_id`. If any group has 2+ chunks, use grouped mode. If all groups have exactly 1 chunk, use flat mode (no group headers).
- **Grouped mode:** Render `SourceGroup` components for each group, sorted by best score descending. Pass `onViewDocument` callback. First group `defaultOpen=true`, rest `defaultOpen=false`.
- **Flat mode:** Render `SourceCard` components directly (current behavior), each with `onViewDocument` prop.
- Manage `DocumentPreview` state locally: `const [previewDoc, setPreviewDoc] = useState(null)`. When `onViewDocument` is called, set `previewDoc = { docId, filename }`. Render `<DocumentPreview>` when set.
- Pass the source index mapping to groups/cards so citation numbering stays consistent (`[1]`, `[2]`, etc. match the order in the sources array).

**Index mapping:** The global citation index is the position in the original `sources` array (1-based). Grouping reorganizes visual layout but indices remain stable so `CitationBadge` → `getElementById('source-N')` still works.

**Important:** The `id` attribute on SourceCard (`source-${index}`) must use the global index from the original sources array, not a per-group local index. This ensures `CitationBadge` scroll-to-source continues working.

#### 6. `CitationBadge.jsx` (modified)
**Changes:**
- Wrap the button with `<SourceTooltip>` component
- Pass the source data: `sources[index - 1]` so the tooltip can render snippet/score/filename
- Click behavior unchanged (scroll + highlight pulse)

### Component Tree

```
MessageBubble
  └─ SourceGrid (receives: sources[])
       ├─ [if grouped mode]
       │    └─ SourceGroup (filename, chunks, startIndex, onViewDocument)
       │         └─ SourceCard (index, ..., onViewDocument)  × N chunks
       │
       ├─ [if flat mode]
       │    └─ SourceCard (index, ..., onViewDocument)  × N sources
       │
       └─ DocumentPreview (conditional on previewDoc state)

MessageBubble (answer text)
  └─ renderParagraphChildren
       └─ CitationBadge (index, sources)
            └─ SourceTooltip (index, source)
```

### Data Flow

```
Backend QueryResponse
  └─ sources: SourceChunk[]  (each has doc_id, filename, chunk_index, content, score)
       │
       ▼
  ChatWindow → MessageBubble (sources prop)
       │
       ├──► SourceGrid: groups by doc_id, decides grouped vs flat
       │       └──► SourceGroup / SourceCard: renders individual chunks
       │              └──► ScoreBar: visualizes score
       │              └──► "View full document" → setPreviewDoc → DocumentPreview modal
       │
       └──► CitationBadge: [N] in answer text
                └──► SourceTooltip: hover preview with snippet + ScoreBar
```

### Styling

All styling uses existing Tailwind utility classes and CSS variables from the Carbon design system. No new CSS files or theme variables needed.

Color palette for score bars uses Tailwind built-in colors (`emerald`, `amber`) rather than the cyan accent, since the accent is reserved for interactive elements and these are informational indicators.

### Accessibility

- SourceTooltip appears on keyboard focus (not just hover), dismissed on blur
- SourceGroup header has `aria-expanded` and `aria-controls`
- "View full document" link has descriptive `aria-label`
- ScoreBar has `role="img"` with `aria-label` like "82% relevant"
- Chevron icon has `aria-hidden="true"`

### Error Handling

- If `source.content` is empty for tooltip, show "No preview available"
- If `onViewDocument` fails (document deleted since ingest), `DocumentPreview` shows empty state gracefully (existing behavior)
- If `score` is null/undefined, ScoreBar renders at 0% with gray color

## Testing

Manual testing checklist:
1. Ask a question that retrieves 3+ chunks from the same document → verify grouped mode with collapsible groups
2. Ask a question that retrieves chunks from different documents → verify flat mode (no group headers)
3. Hover over `[1]` in answer text → verify tooltip appears with snippet after ~300ms
4. Tab-navigate to a citation badge → verify tooltip appears on focus
5. Click a citation badge → verify scroll + highlight pulse still works
6. Expand a source card → verify ScoreBar and "View full document" button
7. Click "View full document" → verify DocumentPreview modal opens with correct content
8. Verify score bar colors match thresholds (green/amber/gray)
9. Verify citation numbering `[1]`, `[2]`, etc. is stable after grouping reorganization
