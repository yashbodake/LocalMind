import { useState, useRef, useEffect } from "react";
import { ArrowUp, Square } from "lucide-react";
import ModelSelector from "./ModelSelector";

export default function ChatInput({
  onSend,
  onStop,
  streaming,
  selectedModel,
  onSelectModel,
  selectedDocIds,
}) {
  const [input, setInput] = useState("");
  const textareaRef = useRef(null);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 168) + "px";
  }, [input]);

  const handleSend = () => {
    const q = input.trim();
    if (!q || streaming) return;
    onSend(q);
    setInput("");
  };

  const onKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const docCount = selectedDocIds?.length || 0;

  return (
    <div className="px-6 pb-5 pt-2 bg-base">
      <div className="max-w-[740px] mx-auto">
        <div className="flex items-center gap-3 bg-surface border border-line rounded-2xl px-4 py-3 focus-within:border-accent/30 transition-colors">
          <span className="font-mono text-accent text-sm shrink-0">&gt;</span>
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Ask a question..."
            rows={1}
            className="flex-1 resize-none bg-transparent text-fg placeholder:text-fg-muted text-sm outline-none font-sans leading-relaxed"
          />
          <div className="flex items-center gap-2 shrink-0">
            <span className="hidden sm:block font-mono text-[10px] text-fg-muted">
              {docCount > 0 ? `${docCount} doc${docCount !== 1 ? "s" : ""}` : "all docs"}
            </span>
            {streaming ? (
              <button
                onClick={onStop}
                className="w-8 h-8 rounded-lg border border-accent/30 bg-accent/10 text-accent flex items-center justify-center hover:bg-accent/15 transition-colors"
                title="Stop"
              >
                <Square size={14} />
              </button>
            ) : (
              <button
                onClick={handleSend}
                disabled={!input.trim()}
                className="w-8 h-8 rounded-lg border border-accent/30 bg-accent/10 text-accent flex items-center justify-center hover:bg-accent/15 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                title="Send"
              >
                <ArrowUp size={16} />
              </button>
            )}
          </div>
        </div>
        <div className="flex items-center justify-between mt-2">
          <ModelSelector selected={selectedModel} onSelect={onSelectModel} />
          <p className="font-mono text-[10px] text-fg-muted/60">
            LocalMind can make mistakes. Verify important info.
          </p>
        </div>
      </div>
    </div>
  );
}
