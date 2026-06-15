# C9 — Rendering & Model Settings

## Date
2026-06-15

## Status
Approved

## Context
Four remaining HIGH-priority features:

1. **No Mermaid rendering** — LLM can generate diagram code blocks but they render as plain text.
2. **No PDF/JSON export** — Only Markdown export exists.
3. **No per-model presets** — Same temperature/max_tokens for all models.
4. **No embedding model selection** — Locked to bge-small-en-v1.5.

## Scope

### Feature 1: Mermaid Diagram Rendering
- Frontend-only. Add `mermaid` npm package.
- Intercept `language-mermaid` code blocks in MessageBubble's code renderer.
- Render as SVG via `mermaid.render()`.
- Fallback to code block if render fails.
- Dark theme initialized to match Carbon design.

### Feature 2: Export as PDF / JSON
- **JSON:** Serialize messages array to `.json` file download. Trivial.
- **PDF:** Open a new window with print-styled HTML, call `window.print()`. No heavy deps.

### Feature 3: Per-Model Parameter Presets
- Store per-model overrides: `generation.temperature.<model>`, `generation.max_tokens.<model>`.
- Generator checks model-specific settings first, falls back to global, then config defaults.
- Settings modal: when a model is "active" (selected in the model selector), show its specific presets section.

### Feature 4: Embedding Model Selection
- Settings: `embedding.model` key (default: `BAAI/bge-small-en-v1.5`).
- Settings modal: dropdown of common embedding models.
- **Warning displayed:** "Changing embedding model requires re-embedding all documents. Existing searches may return poor results until re-embedded."
- "Re-embed All" button: re-chunks and re-embeds all documents with the new model.
- Backend: embedder reinitializes model when setting changes.

---

## Implementation

### Mermaid
- `npm install mermaid`
- New component `MermaidDiagram.jsx` — receives code, renders SVG
- In `MessageBubble.jsx` code renderer: if `lang === "mermaid"`, render `<MermaidDiagram>` instead of `<CodeBlock>`
- Initialize mermaid with dark theme + Carbon background color on first render

### Export PDF/JSON
- `utils/exportChat.js` — add `exportToJSON()` and `exportToPDF()`
- JSON: `Blob` + `URL.createObjectURL` + `<a download>`
- PDF: open new window, write styled HTML, `window.print()`
- ChatWindow: add buttons next to existing Markdown export

### Per-Model Presets
- `routes/settings.py` PUT already accepts arbitrary keys
- `generator.py` `_get_effective_llm_params(model)` — check `generation.temperature.{model}`, `generation.max_tokens.{model}` first
- `SettingsModal.jsx` — add "Model Presets" section with model dropdown + per-model temperature/max_tokens inputs

### Embedding Model Selection
- `database.py` — no schema change (settings is key-value)
- `embedder.py` — `_get_model()` reads `embedding.model` setting on init, caches. New `reset_model()` to force reinit.
- `routes/settings.py` PUT — when `embedding.model` changes, call `reset_model()`
- New endpoint `POST /sources/reembed-all` — re-embeds all documents with current model
- `SettingsModal.jsx` — embedding model dropdown + warning + "Re-embed All" button

## Files Changed

| File | Change |
|------|--------|
| `frontend/package.json` | Add `mermaid` |
| `frontend/src/components/MermaidDiagram.jsx` | New |
| `frontend/src/components/MessageBubble.jsx` | Intercept mermaid code blocks |
| `frontend/src/utils/exportChat.js` | Add `exportToJSON`, `exportToPDF` |
| `frontend/src/components/ChatWindow.jsx` | Add PDF/JSON export buttons |
| `frontend/src/components/SettingsModal.jsx` | Model presets + embedding model |
| `backend/llm/generator.py` | Per-model param lookup |
| `backend/ingest/embedder.py` | `reset_model()`, read model from settings |
| `backend/main.py` | `POST /sources/reembed-all` endpoint |
