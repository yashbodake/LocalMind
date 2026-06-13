export default function TypingIndicator() {
  return (
    <div
      className="flex items-center gap-1.5 px-1 py-2"
      role="status"
      aria-live="polite"
      aria-label="Generating response"
    >
      <span className="w-2 h-2 bg-accent rounded-full animate-bounce [animation-delay:-0.3s] motion-reduce:animate-none" />
      <span className="w-2 h-2 bg-accent rounded-full animate-bounce [animation-delay:-0.15s] motion-reduce:animate-none" />
      <span className="w-2 h-2 bg-accent rounded-full animate-bounce motion-reduce:animate-none" />
      <span className="sr-only">Generating response…</span>
    </div>
  );
}
