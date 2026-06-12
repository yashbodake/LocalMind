import SourceCard from "./SourceCard";

export default function MessageBubble({ role, content, sources = [] }) {
  const isUser = role === "user";

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[75%] rounded-2xl px-4 py-3 ${
          isUser
            ? "bg-blue-600 text-white"
            : "bg-gray-100 text-gray-900"
        }`}
      >
        <p className="whitespace-pre-wrap leading-relaxed">{content}</p>
        {!isUser && sources.length > 0 && (
          <div className="mt-3 space-y-2">
            {sources.map((s, i) => (
              <SourceCard key={i} {...s} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
