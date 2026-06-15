import { useState } from "react";
import { ExternalLink } from "lucide-react";
import ScoreBar from "./ScoreBar";

export default function SourceCard({ index, doc_id, filename, chunk_index, content, score, onViewDocument }) {
  const [open, setOpen] = useState(false);

  const snippet = content && content.length > 100 ? content.slice(0, 100) + "\u2026" : content || "";

  const handleKeyDown = (e) => {
    if (e.currentTarget !== e.target) return;
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
