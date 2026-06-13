import { ArrowDown } from "lucide-react";

export default function ScrollToBottom({ onClick }) {
  return (
    <button
      onClick={onClick}
      className="absolute bottom-32 left-1/2 -translate-x-1/2 w-9 h-9 rounded-full bg-surface border border-line text-fg-secondary flex items-center justify-center shadow-lg hover:text-accent hover:border-accent/30 transition-colors z-10"
      title="Scroll to bottom"
      aria-label="Scroll to bottom"
    >
      <ArrowDown size={16} aria-hidden="true" />
    </button>
  );
}
