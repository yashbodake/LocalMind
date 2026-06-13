import { useState } from "react";
import { Copy, Check, RotateCcw } from "lucide-react";

export default function MessageActions({ content, latencyMs, onRetry }) {
  const [copied, setCopied] = useState(false);

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
      >
        {copied ? <Check size={12} /> : <Copy size={12} />}
        {copied ? "Copied" : "Copy"}
      </button>
      {onRetry && (
        <button
          onClick={onRetry}
          className="flex items-center gap-1.5 px-2.5 py-1 border border-line rounded-md text-fg-muted hover:text-fg-secondary hover:border-line-hover text-xs transition-colors font-sans"
        >
          <RotateCcw size={12} />
          Retry
        </button>
      )}
      {latencyMs != null && (
        <span className="ml-auto font-mono text-[10px] text-fg-muted">
          latency: <span className="text-accent">{latencyMs}ms</span>
        </span>
      )}
    </div>
  );
}
