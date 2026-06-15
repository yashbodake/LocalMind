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
