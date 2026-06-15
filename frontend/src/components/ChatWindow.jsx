import { useState, useRef, useEffect, useCallback } from "react";
import { queryStream, getSession, saveMessage, truncateMessages, getModels, updateFeedback } from "../hooks/useChat";
import { Menu, AlertCircle, Download, FileJson, FileText } from "lucide-react";
import MessageBubble from "./MessageBubble";
import ChatInput from "./ChatInput";
import TypingIndicator from "./TypingIndicator";
import ScrollToBottom from "./ScrollToBottom";
import BrandLogo from "./BrandLogo";
import { exportToMarkdown, exportToJSON, exportToPDF } from "../utils/exportChat";
import { useKeyboardShortcuts } from "../hooks/useKeyboardShortcuts";

const MAX_HISTORY_TURNS = 5;

const SUGGESTED_PROMPTS = [
  "What is RAG?",
  "Summarize my documents",
  "What are embeddings?",
];

export default function ChatWindow({
  sessionId,
  selectedModel,
  onSelectModel,
  selectedDocIds,
  documents,
  onOpenSidebar,
  onSessionLoaded,
  onMessageSaved,
}) {
  const [messages, setMessages] = useState([]);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState(null);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const [sessionTitle, setSessionTitle] = useState("");
  const [models, setModels] = useState([]);
  const scrollRef = useRef(null);
  const bottomRef = useRef(null);
  const abortRef = useRef(null);
  const lastQueryRef = useRef(null);
  const latencyRef = useRef(0);
  const inputRef = useRef(null);
  const onSessionLoadedRef = useRef(onSessionLoaded);
  onSessionLoadedRef.current = onSessionLoaded;

  useEffect(() => {
    getModels()
      .then((data) => setModels(data.models || []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!sessionId) return;
    setMessages([]);
    setError(null);
    getSession(sessionId)
      .then((data) => {
        const loadedMsgs = (data.messages || []).map((m) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          sources: m.sources || [],
          latencyMs: m.latency_ms,
          followups: m.followups || null,
          feedback: m.feedback || null,
        }));
        setMessages(loadedMsgs);
        setSessionTitle(data.title || "Conversation");
        onSessionLoadedRef.current?.(data);
      })
      .catch(() => {
        setError("Failed to load conversation.");
      });
  }, [sessionId]);

  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

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

  const handleStop = () => {
    abortRef.current?.abort();
    setStreaming(false);
  };

  useKeyboardShortcuts({
    onNewChat: null,
    onFocusInput: () => inputRef.current?.focus(),
    onStop: handleStop,
    streaming,
  });

  const handleSend = async (question, modelOverride, overrideDocIds) => {
    setError(null);

    const effectiveModel = modelOverride || selectedModel;
    const effectiveDocIds = overrideDocIds || selectedDocIds;

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
    lastQueryRef.current = { question, history, model: effectiveModel, doc_ids: effectiveDocIds };
    latencyRef.current = Date.now();

    await queryStream(
      question,
      { history, model: effectiveModel, doc_ids: effectiveDocIds },
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

        if (sessionId) {
          saveMessage(sessionId, { role: "user", content: question })
            .then(() =>
              saveMessage(sessionId, {
                role: "assistant",
                content: assistantContent,
                latency_ms: elapsed,
                model: effectiveModel,
              })
            )
            .then((res) => {
              if (res.id) {
                setMessages((prev) => {
                  const updated = [...prev];
                  updated[updated.length - 1] = {
                    ...updated[updated.length - 1],
                    id: res.id,
                  };
                  return updated;
                });
              }
              if (res.auto_title) {
                onMessageSaved?.(res.auto_title);
                setSessionTitle(res.auto_title);
              }
              if (res.followups) {
                setMessages((prev) => {
                  const updated = [...prev];
                  updated[updated.length - 1] = {
                    ...updated[updated.length - 1],
                    followups: res.followups,
                  };
                  return updated;
                });
              }
            })
            .catch((err) => console.error("Save failed:", err));
        }
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

  const handleRetry = (modelOverride) => {
    if (!lastQueryRef.current) return;
    const { question } = lastQueryRef.current;
    if (modelOverride) {
      onSelectModel(modelOverride);
    }
    setMessages((prev) => prev.slice(0, -1));
    handleSend(question, modelOverride);
  };

  const handleFeedback = async (messageIndex, feedback) => {
    const msg = messages[messageIndex];
    if (!msg?.id) return;

    setMessages((prev) => {
      const updated = [...prev];
      updated[messageIndex] = { ...updated[messageIndex], feedback };
      return updated;
    });

    try {
      await updateFeedback(sessionId, msg.id, feedback);
    } catch (err) {
      console.error("Feedback failed:", err);
      setMessages((prev) => {
        const updated = [...prev];
        updated[messageIndex] = { ...updated[messageIndex], feedback: msg.feedback };
        return updated;
      });
    }
  };

  const handleSendFromInput = (question, mentionedDocIds) => {
    handleSend(question, null, mentionedDocIds);
  };

  const handleEdit = async (messageIndex, newText) => {
    if (streaming) return;
    setError(null);

    const truncateFrom = messageIndex;
    const savedMessages = [...messages];

    setMessages((prev) => {
      const kept = prev.slice(0, truncateFrom);
      return [...kept, { role: "user", content: newText }];
    });

    try {
      await truncateMessages(sessionId, truncateFrom);
    } catch (err) {
      console.error("Truncate failed:", err);
      setMessages(savedMessages);
      setError("Failed to edit. Please try again.");
      return;
    }

    setStreaming(true);

    const history = savedMessages
      .slice(0, truncateFrom)
      .slice(-MAX_HISTORY_TURNS * 2)
      .map((m) => ({ role: m.role, content: m.content }));

    setMessages((prev) => [
      ...prev,
      { role: "assistant", content: "", sources: [] },
    ]);

    let assistantContent = "";
    const controller = new AbortController();
    abortRef.current = controller;
    lastQueryRef.current = { question: newText, history, model: selectedModel, doc_ids: selectedDocIds };
    latencyRef.current = Date.now();

    await queryStream(
      newText,
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

        if (sessionId) {
          saveMessage(sessionId, { role: "user", content: newText })
            .then(() =>
              saveMessage(sessionId, {
                role: "assistant",
                content: assistantContent,
                latency_ms: elapsed,
                model: selectedModel,
              })
            )
            .then((res) => {
              if (res.id) {
                setMessages((prev) => {
                  const updated = [...prev];
                  updated[updated.length - 1] = {
                    ...updated[updated.length - 1],
                    id: res.id,
                  };
                  return updated;
                });
              }
              if (res.auto_title) {
                onMessageSaved?.(res.auto_title);
                setSessionTitle(res.auto_title);
              }
              if (res.followups) {
                setMessages((prev) => {
                  const updated = [...prev];
                  updated[updated.length - 1] = {
                    ...updated[updated.length - 1],
                    followups: res.followups,
                  };
                  return updated;
                });
              }
            })
            .catch((err) => console.error("Save failed:", err));
        }
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

  const handleFollowUp = (q) => handleSend(q);

  const handleExport = () => {
    exportToMarkdown({ title: sessionTitle, id: sessionId }, messages);
  };

  const handleExportJSON = () => {
    exportToJSON({ title: sessionTitle, id: sessionId }, messages);
  };

  const handleExportPDF = () => {
    exportToPDF({ title: sessionTitle, id: sessionId }, messages);
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
        <button
          onClick={handleExport}
          disabled={messages.length === 0 || streaming}
          className="p-1.5 rounded-lg text-fg-secondary hover:text-accent disabled:opacity-30 transition-colors"
          aria-label="Export as Markdown"
          title="Export as Markdown"
        >
          <Download size={16} aria-hidden="true" />
        </button>
        <button
          onClick={handleExportPDF}
          disabled={messages.length === 0 || streaming}
          className="p-1.5 rounded-lg text-fg-secondary hover:text-accent disabled:opacity-30 transition-colors"
          aria-label="Export as PDF"
          title="Export as PDF"
        >
          <FileText size={16} aria-hidden="true" />
        </button>
        <button
          onClick={handleExportJSON}
          disabled={messages.length === 0 || streaming}
          className="p-1.5 rounded-lg text-fg-secondary hover:text-accent disabled:opacity-30 transition-colors"
          aria-label="Export as JSON"
          title="Export as JSON"
        >
          <FileJson size={16} aria-hidden="true" />
        </button>
      </div>

      <div className="hidden md:flex absolute top-4 right-6 z-10 gap-1">
        <button
          onClick={handleExport}
          disabled={messages.length === 0 || streaming}
          className="p-1.5 rounded-lg text-fg-secondary hover:text-accent disabled:opacity-30 transition-colors"
          aria-label="Export as Markdown"
          title="Export as Markdown"
        >
          <Download size={16} aria-hidden="true" />
        </button>
        <button
          onClick={handleExportPDF}
          disabled={messages.length === 0 || streaming}
          className="p-1.5 rounded-lg text-fg-secondary hover:text-accent disabled:opacity-30 transition-colors"
          aria-label="Export as PDF"
          title="Export as PDF"
        >
          <FileText size={16} aria-hidden="true" />
        </button>
        <button
          onClick={handleExportJSON}
          disabled={messages.length === 0 || streaming}
          className="p-1.5 rounded-lg text-fg-secondary hover:text-accent disabled:opacity-30 transition-colors"
          aria-label="Export as JSON"
          title="Export as JSON"
        >
          <FileJson size={16} aria-hidden="true" />
        </button>
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
              messageIndex={i}
              streaming={streaming}
              onEdit={msg.role === "user" ? handleEdit : null}
              onFollowUp={handleFollowUp}
              onRetry={msg.role === "assistant" && i === messages.length - 1 ? handleRetry : null}
              onRetryWithModel={msg.role === "assistant" && i === messages.length - 1 ? handleRetry : null}
              models={models}
              onFeedback={msg.role === "assistant" ? (feedback) => handleFeedback(i, feedback) : null}
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
        ref={inputRef}
        onSend={handleSendFromInput}
        onStop={handleStop}
        streaming={streaming}
        selectedModel={selectedModel}
        onSelectModel={onSelectModel}
        selectedDocIds={selectedDocIds}
        documents={documents}
      />
    </div>
  );
}
