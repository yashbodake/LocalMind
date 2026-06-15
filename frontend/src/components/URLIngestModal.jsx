import { useState } from "react";
import { X, Link2, Loader2 } from "lucide-react";

export default function URLIngestModal({ onClose, onSubmit }) {
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const trimmedUrl = url.trim();
    if (!trimmedUrl) return;

    setLoading(true);
    setError(null);
    try {
      await onSubmit({ url: trimmedUrl, title: title.trim() || undefined });
      onClose();
    } catch (err) {
      setError(err.message || "Failed to ingest URL");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <form
        onSubmit={handleSubmit}
        className="bg-surface border border-line rounded-2xl w-full max-w-lg flex flex-col mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-5 py-3 border-b border-line">
          <Link2 size={16} className="text-accent shrink-0" aria-hidden="true" />
          <h3 className="text-fg text-sm font-semibold flex-1">Ingest from URL</h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-fg-muted hover:text-fg hover:bg-elevated transition-colors shrink-0"
            aria-label="Close"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>
        <div className="px-5 py-4 space-y-3">
          <div>
            <label className="block text-[10px] font-mono uppercase tracking-wider text-fg-muted mb-1.5">
              URL
            </label>
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com/article"
              autoFocus
              required
              className="w-full bg-elevated border border-line rounded-lg px-3 py-2 text-fg text-sm font-sans placeholder:text-fg-muted outline-none focus:border-accent/30"
            />
          </div>
          <div>
            <label className="block text-[10px] font-mono uppercase tracking-wider text-fg-muted mb-1.5">
              Title (optional)
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="My Article"
              className="w-full bg-elevated border border-line rounded-lg px-3 py-2 text-fg text-sm font-sans placeholder:text-fg-muted outline-none focus:border-accent/30"
            />
          </div>
          {error && (
            <p className="text-xs text-accent bg-accent/5 border border-accent/20 rounded-md px-3 py-2">
              {error}
            </p>
          )}
        </div>
        <div className="flex justify-end gap-2 px-5 py-3 border-t border-line">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 text-xs font-sans text-fg-muted hover:text-fg border border-line rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading || !url.trim()}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-sans text-accent bg-accent/10 border border-accent/30 rounded-lg hover:bg-accent/15 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? <Loader2 size={12} className="animate-spin" aria-hidden="true" /> : <Link2 size={12} aria-hidden="true" />}
            {loading ? "Fetching…" : "Ingest"}
          </button>
        </div>
      </form>
    </div>
  );
}
