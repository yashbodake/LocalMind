import { useState, useEffect } from "react";
import { X, FileText } from "lucide-react";
import { getDocumentContent } from "../hooks/useChat";

export default function DocumentPreview({ docId, filename, onClose }) {
  const [content, setContent] = useState("");
  const [meta, setMeta] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!docId) return;
    setLoading(true);
    getDocumentContent(docId)
      .then((data) => {
        setContent(data.content || "");
        setMeta(data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [docId]);

  const formatSize = (kb) => {
    if (kb < 1) return `${(kb * 1024).toFixed(0)} B`;
    if (kb < 1024) return `${kb.toFixed(1)} KB`;
    return `${(kb / 1024).toFixed(1)} MB`;
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-surface border border-line rounded-2xl w-full max-w-3xl max-h-[80vh] flex flex-col mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-5 py-3 border-b border-line">
          <FileText size={16} className="text-accent shrink-0" aria-hidden="true" />
          <div className="flex-1 min-w-0">
            <h3 className="text-fg text-sm font-semibold truncate">{filename}</h3>
            {meta && (
              <div className="flex gap-3 mt-0.5 text-[10px] font-mono text-fg-muted">
                <span>{meta.file_type}</span>
                <span>{formatSize(meta.size_kb)}</span>
                <span>{meta.word_count} words</span>
                <span>{meta.chunk_count} chunks</span>
              </div>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-fg-muted hover:text-fg hover:bg-elevated transition-colors shrink-0"
            aria-label="Close preview"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {loading ? (
            <p className="text-fg-muted text-sm">Loading…</p>
          ) : (
            <pre className="text-fg-secondary text-xs whitespace-pre-wrap font-sans leading-relaxed">
              {content}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}
