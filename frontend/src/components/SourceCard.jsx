import { useState } from "react";
import { ChevronDown, ChevronRight, FileText } from "lucide-react";

export default function SourceCard({ filename, chunk_index, content, score }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="border border-gray-200 rounded-lg bg-gray-50 text-sm">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-gray-100 transition-colors"
      >
        {open ? (
          <ChevronDown size={14} className="text-gray-500 shrink-0" />
        ) : (
          <ChevronRight size={14} className="text-gray-500 shrink-0" />
        )}
        <FileText size={14} className="text-gray-400 shrink-0" />
        <span className="truncate text-gray-700">{filename}</span>
        <span className="ml-auto text-xs text-gray-400">chunk {chunk_index}</span>
        <span className="ml-2 px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 text-xs font-medium">
          {score.toFixed(2)}
        </span>
      </button>
      {open && (
        <div className="px-3 pb-3 text-gray-600 leading-relaxed whitespace-pre-wrap border-t border-gray-200 pt-2">
          {content}
        </div>
      )}
    </div>
  );
}
