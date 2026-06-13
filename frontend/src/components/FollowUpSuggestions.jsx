export default function FollowUpSuggestions({ suggestions, onSelect }) {
  if (!suggestions || suggestions.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2 mt-3">
      {suggestions.map((q, i) => (
        <button
          key={i}
          onClick={() => onSelect(q)}
          className="px-3 py-1.5 text-xs font-sans text-fg-secondary border border-line rounded-lg hover:border-accent/30 hover:text-accent transition-colors"
        >
          {q}
        </button>
      ))}
    </div>
  );
}
