import { useState, useRef, useEffect } from "react";
import { Menu, AlertCircle } from "lucide-react";
import MessageBubble from "./MessageBubble";
import ChatInput from "./ChatInput";
import TypingIndicator from "./TypingIndicator";
import ScrollToBottom from "./ScrollToBottom";
import BrandLogo from "./BrandLogo";
import { queryStream } from "../hooks/useChat";

const MAX_HISTORY_TURNS = 5;

const SUGGESTED_PROMPTS = [
  "What is RAG?",
  "Summarize my documents",
  "What are embeddings?",
];

export default function ChatWindow({
  selectedModel,
  onSelectModel,
  selectedDocIds,
  onOpenSidebar,
}) {
  const [messages, setMessages] = useState([]);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState(null);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const scrollRef = useRef(null);
  const bottomRef = useRef(null);
  const abortRef = useRef(null);
  const lastQueryRef = useRef(null);
  const latencyRef = useRef(0);

  const scrollToBottom = () => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 100;
    setShowScrollBtn(!atBottom && messages.length > 0);
  };

  useEffect(() => {
    if (!showScrollBtn) scrollToBottom();
  }, [messages]);

  const handleSend = async (question) => {
    setError(null);

    const history = messages
      .slice(-MAX_HISTORY_TURNS * 2)
      .map((m) => ({ role: m.role, content: m.content }));

    setMessages((prev) => [...prev, { role: "user", content: question }]);
    setStreaming(true);

    let assistantContent = "";
    setMessages((prev) => [
      ...prev,
      { role: "assistant", content: "", sources: [] },
    ]);

    const controller = new AbortController();
    abortRef.current = controller;
    lastQueryRef.current = { question, history, model: selectedModel, doc_ids: selectedDocIds };
    latencyRef.current = Date.now();

    await queryStream(
      question,
      { history, model: selectedModel, doc_ids: selectedDocIds },
      (chunk) => {
        assistantContent += chunk;
        setMessages((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = {
            role: "assistant",
            content: assistantContent,
            sources: [],
          };
          return updated;
        });
      },
      () => {
        const elapsed = Date.now() - latencyRef.current;
        setStreaming(false);
        setMessages((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = {
            ...updated[updated.length - 1],
            latencyMs: elapsed,
          };
          return updated;
        });
      },
      (err) => {
        setStreaming(false);
        if (!assistantContent) {
          setError("Failed to get a response. Please try again.");
          setMessages((prev) => prev.slice(0, -1));
        }
      },
      controller.signal
    );
  };

  const handleStop = () => {
    abortRef.current?.abort();
    setStreaming(false);
  };

  const handleRetry = () => {
    if (!lastQueryRef.current) return;
    const { question, history, model, doc_ids } = lastQueryRef.current;
    setMessages((prev) => {
      const withoutLast = prev.slice(0, -1);
      return withoutLast;
    });
    handleSend(question);
  };

  const lastMsg = messages[messages.length - 1];
  const waitingForFirstToken =
    streaming && lastMsg?.role === "assistant" && !lastMsg.content;

  return (
    <div className="flex flex-col h-full bg-base relative">
      <h1 className="sr-only">LocalMind Chat</h1>
      <div className="md:hidden flex items-center gap-3 px-4 py-3 border-b border-line bg-surface">
        <button
          onClick={onOpenSidebar}
          className="p-1.5 rounded-lg text-fg-secondary hover:text-accent"
          aria-label="Open sidebar"
        >
          <Menu size={18} aria-hidden="true" />
        </button>
        <BrandLogo size="sm" />
      </div>

      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto"
      >
        <div className="max-w-[740px] mx-auto px-6 md:px-9 py-8">
          {messages.length === 0 && !error && (
            <div className="flex flex-col items-center justify-center h-full gap-4 py-20">
              <img src="/logo.png" alt="LocalMind" width={64} height={64} className="w-16 h-16 rounded-xl" />
              <h2 className="text-fg text-xl font-semibold font-display">
                Ask a question about your documents
              </h2>
              <p className="text-fg-muted text-sm text-center max-w-xs">
                Upload files in the sidebar, then query your knowledge base
              </p>
              <div className="flex flex-wrap gap-2 justify-center mt-2">
                {SUGGESTED_PROMPTS.map((prompt) => (
                  <button
                    key={prompt}
                    onClick={() => handleSend(prompt)}
                    className="px-3 py-1.5 text-xs font-sans text-fg-secondary border border-line rounded-lg hover:border-accent/30 hover:text-accent transition-colors"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg, i) => (
            <MessageBubble
              key={i}
              {...msg}
              onRetry={msg.role === "assistant" && i === messages.length - 1 ? handleRetry : null}
            />
          ))}

          {waitingForFirstToken && <TypingIndicator />}

          {error && (
            <div className="flex justify-center my-4" role="alert" aria-live="polite">
              <div className="flex items-center gap-2 text-accent bg-accent/5 border border-accent/20 rounded-lg px-4 py-2 text-sm">
                <AlertCircle size={16} aria-hidden="true" />
                {error}
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      </div>

      {showScrollBtn && <ScrollToBottom onClick={scrollToBottom} />}

      <ChatInput
        onSend={handleSend}
        onStop={handleStop}
        streaming={streaming}
        selectedModel={selectedModel}
        onSelectModel={onSelectModel}
        selectedDocIds={selectedDocIds}
      />
    </div>
  );
}
