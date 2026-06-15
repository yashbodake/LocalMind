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
