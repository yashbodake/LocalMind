import { useState } from "react";

export default function SourceCard({ index, filename, chunk_index, content, score }) {
  const [open, setOpen] = useState(false);

  const snippet = content.length > 100 ? content.slice(0, 100) + "…" : content;

  return (
    <button
      type="button"
      id={`source-${index}`}
      className="w-full text-left bg-surface border border-line rounded-lg p-3 cursor-pointer hover:border-accent/20 transition-all"
      onClick={() => setOpen(!open)}
      aria-expanded={open}
      aria-label={`Source ${index}: ${filename}${open ? " (expanded)" : ""}`}
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
    </button>
  );
}
