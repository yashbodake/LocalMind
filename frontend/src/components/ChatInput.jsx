import { useState, useRef, useEffect, forwardRef, useImperativeHandle } from "react";
import { ArrowUp, Square } from "lucide-react";
import ModelSelector from "./ModelSelector";
import SlashCommandMenu from "./SlashCommandMenu";
import MentionMenu from "./MentionMenu";
import { SLASH_COMMANDS } from "../data/slashCommands";

const ChatInput = forwardRef(function ChatInput({
  onSend,
  onStop,
  streaming,
  selectedModel,
  onSelectModel,
  selectedDocIds,
  documents,
}, ref) {
  const [input, setInput] = useState("");
  const [slashOpen, setSlashOpen] = useState(false);
  const [slashIndex, setSlashIndex] = useState(0);
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionIndex, setMentionIndex] = useState(0);
  const textareaRef = useRef(null);

  useImperativeHandle(ref, () => ({
    focus: () => textareaRef.current?.focus(),
  }));

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 168) + "px";
  }, [input]);

  const slashMatches = slashOpen
    ? SLASH_COMMANDS.filter((c) => c.cmd.startsWith(input))
    : [];

  const lastAtIndex = input.lastIndexOf("@");
  const mentionQuery = mentionOpen && lastAtIndex !== -1
    ? input.slice(lastAtIndex + 1)
    : "";
  const mentionMatches = mentionOpen
    ? (documents || []).filter((d) =>
        d.filename.toLowerCase().includes(mentionQuery.toLowerCase())
      )
    : [];

  useEffect(() => {
    if (input.startsWith("/") && !input.includes(" ")) {
      const matches = SLASH_COMMANDS.filter((c) => c.cmd.startsWith(input));
      setSlashOpen(matches.length > 0);
      setSlashIndex(0);
      setMentionOpen(false);
    } else {
      setSlashOpen(false);
      const atIdx = input.lastIndexOf("@");
      if (atIdx !== -1) {
        const afterAt = input.slice(atIdx + 1);
        if (!afterAt.includes(" ") && afterAt.length <= 50) {
          const matches = (documents || []).filter((d) =>
            d.filename.toLowerCase().includes(afterAt.toLowerCase())
          );
          setMentionOpen(matches.length > 0);
          setMentionIndex(0);
        } else {
          setMentionOpen(false);
        }
      } else {
        setMentionOpen(false);
      }
    }
  }, [input, documents]);

  const handleSlashSelect = (cmd) => {
    const restOfInput = input.replace(/^\/\w*/, "").trim();
    setInput(restOfInput ? `${cmd.prefix} ${restOfInput}` : `${cmd.prefix} `);
    setSlashOpen(false);
    setTimeout(() => textareaRef.current?.focus(), 0);
  };

  const handleMentionSelect = (doc) => {
    const atIdx = input.lastIndexOf("@");
    if (atIdx !== -1) {
      const before = input.slice(0, atIdx);
      setInput(`${before}@${doc.filename} `);
    }
    setMentionOpen(false);
    setTimeout(() => textareaRef.current?.focus(), 0);
  };

  const handleSend = () => {
    const q = input.trim();
    if (!q || streaming) return;

    const mentionRegex = /@([^\s]+(?:\.[a-zA-Z0-9]+))/g;
    const mentionedDocs = [];
    let match;
    while ((match = mentionRegex.exec(q)) !== null) {
      const doc = (documents || []).find((d) => d.filename === match[1]);
      if (doc) mentionedDocs.push(doc.doc_id);
    }

    onSend(q, mentionedDocs.length > 0 ? mentionedDocs : undefined);
    setInput("");
    setSlashOpen(false);
    setMentionOpen(false);
  };

  const menuOpen = slashOpen || mentionOpen;

  const onKeyDown = (e) => {
    if (menuOpen) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        const max = slashOpen ? slashMatches.length - 1 : mentionMatches.length - 1;
        if (slashOpen) setSlashIndex((prev) => Math.min(prev + 1, max));
        else setMentionIndex((prev) => Math.min(prev + 1, max));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        if (slashOpen) setSlashIndex((prev) => Math.max(prev - 1, 0));
        else setMentionIndex((prev) => Math.max(prev - 1, 0));
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        if (slashOpen && slashMatches[slashIndex]) {
          handleSlashSelect(slashMatches[slashIndex]);
        } else if (mentionMatches[mentionIndex]) {
          handleMentionSelect(mentionMatches[mentionIndex]);
        }
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setSlashOpen(false);
        setMentionOpen(false);
        return;
      }
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const docCount = selectedDocIds?.length || 0;

  return (
    <div className="px-6 pb-5 pt-2 bg-base">
      <div className="max-w-[740px] mx-auto">
        <div className="relative">
          {slashOpen && slashMatches.length > 0 && (
            <SlashCommandMenu
              commands={slashMatches}
              selectedIndex={slashIndex}
              onSelect={handleSlashSelect}
            />
          )}
          {mentionOpen && mentionMatches.length > 0 && (
            <MentionMenu
              documents={mentionMatches}
              selectedIndex={mentionIndex}
              onSelect={handleMentionSelect}
            />
          )}
          <div className="flex items-center gap-3 bg-surface border border-line rounded-2xl px-4 py-3 focus-within:border-accent/30 transition-colors">
            <span className="font-mono text-accent text-sm shrink-0">&gt;</span>
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Ask a question… use / for commands, @ to mention docs"
              rows={1}
              name="query"
              autoComplete="off"
              aria-label="Ask a question"
              className="flex-1 min-w-0 resize-none bg-transparent text-fg placeholder:text-fg-muted text-sm outline-none focus-visible:outline-none font-sans leading-relaxed"
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
                  aria-label="Stop generating"
                >
                  <Square size={14} aria-hidden="true" />
                </button>
              ) : (
                <button
                  onClick={handleSend}
                  disabled={!input.trim()}
                  className="w-8 h-8 rounded-lg border border-accent/30 bg-accent/10 text-accent flex items-center justify-center hover:bg-accent/15 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  title="Send"
                  aria-label="Send message"
                >
                  <ArrowUp size={16} aria-hidden="true" />
                </button>
              )}
            </div>
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
});

export default ChatInput;
