import { useState, useEffect, useRef } from "react";
import { Copy, Check, RotateCcw, ChevronDown, ThumbsUp, ThumbsDown } from "lucide-react";

export default function MessageActions({ content, latencyMs, onRetry, onRetryWithModel, models, feedback, onFeedback }) {
  const [copied, setCopied] = useState(false);
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const modelMenuRef = useRef(null);

  useEffect(() => {
    if (!modelMenuOpen) return;
    const handler = (e) => {
      if (modelMenuRef.current && !modelMenuRef.current.contains(e.target)) {
        setModelMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [modelMenuOpen]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  return (
    <div className="flex items-center gap-1.5 mt-3">
      <button
        onClick={handleCopy}
        className="flex items-center gap-1.5 px-2.5 py-1 border border-line rounded-md text-fg-muted hover:text-fg-secondary hover:border-line-hover text-xs transition-colors font-sans"
        aria-label={copied ? "Copied to clipboard" : "Copy response"}
      >
        {copied ? <Check size={12} aria-hidden="true" /> : <Copy size={12} aria-hidden="true" />}
        {copied ? "Copied" : "Copy"}
      </button>
      {onRetry && (
        <div className="relative flex items-center" ref={modelMenuRef}>
          <button
            onClick={onRetry}
            className={`flex items-center gap-1.5 px-2.5 py-1 border border-line text-fg-muted hover:text-fg-secondary hover:border-line-hover text-xs transition-colors font-sans ${
              onRetryWithModel && models && models.length > 0 ? "rounded-l-md" : "rounded-md"
            }`}
            aria-label="Retry response"
          >
            <RotateCcw size={12} aria-hidden="true" />
            Retry
          </button>
          {onRetryWithModel && models && models.length > 0 && (
            <>
              <button
                onClick={() => setModelMenuOpen(!modelMenuOpen)}
                className="flex items-center px-1.5 py-1 border border-l-0 border-line rounded-r-md text-fg-muted hover:text-fg-secondary hover:border-line-hover text-xs transition-colors font-sans"
                aria-label="Regenerate with different model"
                aria-expanded={modelMenuOpen}
              >
                <ChevronDown size={12} aria-hidden="true" />
              </button>
              {modelMenuOpen && (
                <div className="absolute bottom-full left-0 mb-1 bg-surface border border-line rounded-lg shadow-xl z-30 min-w-[200px] max-h-[200px] overflow-y-auto">
                  <ul>
                    {models.map((m) => (
                      <li key={m}>
                        <button
                          onClick={() => {
                            onRetryWithModel(m);
                            setModelMenuOpen(false);
                          }}
                          className="w-full text-left px-3 py-1.5 text-xs text-fg-secondary hover:bg-accent/10 font-mono truncate"
                        >
                          {m}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>
      )}
      {onFeedback && (
        <>
          <button
            onClick={() => onFeedback(feedback === "up" ? null : "up")}
            className={`flex items-center gap-1 px-2 py-1 border rounded-md text-xs transition-colors font-sans ${
              feedback === "up"
                ? "border-accent/30 text-accent bg-accent/10"
                : "border-line text-fg-muted hover:text-fg-secondary hover:border-line-hover"
            }`}
            aria-label="Mark as helpful"
            aria-pressed={feedback === "up"}
          >
            <ThumbsUp size={12} aria-hidden="true" />
          </button>
          <button
            onClick={() => onFeedback(feedback === "down" ? null : "down")}
            className={`flex items-center gap-1 px-2 py-1 border rounded-md text-xs transition-colors font-sans ${
              feedback === "down"
                ? "border-accent/30 text-accent bg-accent/10"
                : "border-line text-fg-muted hover:text-fg-secondary hover:border-line-hover"
            }`}
            aria-label="Mark as not helpful"
            aria-pressed={feedback === "down"}
          >
            <ThumbsDown size={12} aria-hidden="true" />
          </button>
        </>
      )}
      {latencyMs != null && (
        <span className="ml-auto font-mono text-[10px] text-fg-muted">
          latency: <span className="text-accent">{latencyMs}ms</span>
        </span>
      )}
    </div>
  );
}
