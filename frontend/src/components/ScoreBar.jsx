export default function ScoreBar({ score, compact = false }) {
  const safeScore = score ?? 0;
  const pct = Math.round(safeScore * 100);
  const barColor = pct >= 70 ? "bg-emerald-400" : pct >= 40 ? "bg-amber-400" : "bg-fg-muted";
  const labelColor = pct >= 70 ? "text-emerald-400" : pct >= 40 ? "text-amber-400" : "text-fg-muted";

  return (
    <div
      className="flex items-center gap-1.5"
      role="img"
      aria-label={`${pct}% relevant`}
    >
      <div className={`flex-1 ${compact ? "h-[3px]" : "h-1"} bg-elevated rounded-full overflow-hidden`}>
        <div
          className={`h-full ${barColor} rounded-full transition-all`}
          style={{ width: `${pct}%` }}
        />
      </div>
      {!compact && (
        <span className={`font-mono text-[10px] ${labelColor} shrink-0`}>{pct}%</span>
      )}
    </div>
  );
}
