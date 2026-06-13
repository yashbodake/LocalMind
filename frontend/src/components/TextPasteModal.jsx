import { useState } from "react";
import { X } from "lucide-react";

export default function TextPasteModal({ onClose, onSubmit }) {
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async () => {
    if (!text.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit({ title: title.trim() || "Pasted Note", text: text.trim() });
      onClose();
    } catch (e) {
      setError(e.message || "Failed to ingest text");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-surface border border-line rounded-2xl w-full max-w-2xl flex flex-col mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-line">
          <h3 className="text-fg text-sm font-semibold">Paste Text</h3>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-fg-muted hover:text-fg hover:bg-elevated transition-colors"
            aria-label="Close"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>
        <div className="px-5 py-4 space-y-3">
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Title (optional)"
            className="w-full bg-base border border-line rounded-lg px-3 py-2 text-fg text-sm outline-none focus:border-accent/30"
            aria-label="Document title"
          />
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Paste your text here…"
            rows={10}
            className="w-full bg-base border border-line rounded-lg px-3 py-2 text-fg text-sm outline-none focus:border-accent/30 resize-none font-sans"
            aria-label="Text content"
          />
          {error && <p className="text-accent text-xs">{error}</p>}
        </div>
        <div className="flex justify-end gap-2 px-5 py-3 border-t border-line">
          <button
            onClick={onClose}
            className="px-3 py-1.5 border border-line rounded-lg text-fg-muted hover:text-fg text-xs transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!text.trim() || submitting}
            className="px-3 py-1.5 border border-accent/30 bg-accent/10 rounded-lg text-accent text-xs disabled:opacity-30 transition-colors"
          >
            {submitting ? "Ingesting…" : "Ingest Text"}
          </button>
        </div>
      </div>
    </div>
  );
}
