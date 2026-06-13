import SourceCard from "./SourceCard";

export default function SourceGrid({ sources }) {
  if (!sources || sources.length === 0) return null;

  return (
    <div className="mt-4">
      <div className="font-mono text-[9px] font-semibold uppercase tracking-wider text-fg-muted mb-2.5">
        // retrieved sources
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {sources.map((s, i) => (
          <SourceCard key={i} index={i + 1} {...s} />
        ))}
      </div>
    </div>
  );
}
