export default function TypingIndicator() {
  return (
    <div className="flex items-center gap-1.5 px-1 py-2">
      <span className="w-2 h-2 bg-accent rounded-full animate-bounce [animation-delay:-0.3s]" />
      <span className="w-2 h-2 bg-accent rounded-full animate-bounce [animation-delay:-0.15s]" />
      <span className="w-2 h-2 bg-accent rounded-full animate-bounce" />
    </div>
  );
}
