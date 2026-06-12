import { useState, useRef, useEffect } from "react";
import { Send, AlertCircle } from "lucide-react";
import MessageBubble from "./MessageBubble";
import { queryStream } from "../hooks/useChat";

export default function ChatWindow() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState(null);
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streaming]);

  const handleSend = () => {
    const question = input.trim();
    if (!question || streaming) return;

    setInput("");
    setError(null);
    setMessages((prev) => [...prev, { role: "user", content: question }]);
    setStreaming(true);

    let assistantContent = "";
    setMessages((prev) => [
      ...prev,
      { role: "assistant", content: "", sources: [] },
    ]);

    const es = queryStream(
      question,
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
        setStreaming(false);
      }
    );

    es.onerror = () => {
      es.close();
      setStreaming(false);
      if (!assistantContent) {
        setError("Failed to get a response. Please try again.");
        setMessages((prev) => prev.slice(0, -1));
      }
    };
  };

  const onKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const lastMsg = messages[messages.length - 1];
  const waitingForFirstToken =
    streaming && lastMsg?.role === "assistant" && !lastMsg.content;

  return (
    <div className="flex flex-col h-full bg-gray-50">
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {messages.length === 0 && !error && (
          <div className="flex flex-col items-center justify-center h-full gap-3">
            <div className="w-16 h-16 rounded-full bg-blue-100 flex items-center justify-center">
              <Send size={24} className="text-blue-500" />
            </div>
            <p className="text-gray-400 text-lg">
              Ask a question about your documents
            </p>
            <p className="text-gray-300 text-sm">
              Upload files in the sidebar, then query your knowledge base
            </p>
          </div>
        )}
        {messages.map((msg, i) => (
          <MessageBubble key={i} {...msg} />
        ))}
        {waitingForFirstToken && (
          <div className="flex justify-start">
            <div className="bg-gray-100 rounded-2xl px-4 py-3 flex items-center gap-1.5">
              <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:-0.3s]" />
              <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:-0.15s]" />
              <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" />
            </div>
          </div>
        )}
        {error && (
          <div className="flex justify-center">
            <div className="flex items-center gap-2 text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-2 text-sm">
              <AlertCircle size={16} />
              {error}
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="border-t border-gray-200 bg-white p-4">
        <div className="flex gap-2 max-w-3xl mx-auto">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Ask a question..."
            rows={1}
            className="flex-1 resize-none rounded-lg border border-gray-300 px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || streaming}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Send size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}
