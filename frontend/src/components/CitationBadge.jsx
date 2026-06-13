export default function CitationBadge({ index, sources }) {
  if (index > sources.length) return <span className="text-fg-muted">[{index}]</span>;
  return (
    <sup>
      <button
        onClick={() => {
          const card = document.getElementById(`source-${index}`);
          if (card) {
            card.scrollIntoView({ behavior: "smooth", block: "center" });
            card.classList.add("ring-2", "ring-accent");
            setTimeout(() => card.classList.remove("ring-2", "ring-accent"), 2000);
          }
        }}
        className="font-mono text-accent text-[9px] font-semibold border border-accent/25 px-1 py-px rounded ml-0.5 cursor-pointer hover:bg-accent/10 align-super"
        aria-label={`Jump to source ${index}`}
      >
        [{index}]
      </button>
    </sup>
  );
}
