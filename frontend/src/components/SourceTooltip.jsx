import { useState, useRef, useEffect } from "react";
import ScoreBar from "./ScoreBar";

export default function SourceTooltip({ index, source, children }) {
  const [show, setShow] = useState(false);
  const timerRef = useRef(null);

  useEffect(() => {
    return () => clearTimeout(timerRef.current);
  }, []);

  const handleEnter = () => {
    timerRef.current = setTimeout(() => setShow(true), 300);
  };

  const handleLeave = () => {
    clearTimeout(timerRef.current);
    setShow(false);
  };

  const snippet = source?.content
    ? source.content.length > 150
      ? source.content.slice(0, 150) + "\u2026"
      : source.content
    : "No preview available";

  return (
    <span
      className="relative inline-block"
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
      onFocus={() => setShow(true)}
      onBlur={handleLeave}
    >
      {children}
      {show && source && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-[280px] bg-surface border border-line rounded-lg p-3 shadow-xl z-40 pointer-events-none">
          <div className="flex items-center gap-2 mb-2">
            <span className="font-mono text-[10px] font-bold text-accent bg-accent/10 px-1.5 py-0.5 rounded shrink-0">
              [{index}]
            </span>
            <span className="text-fg-secondary text-xs font-medium truncate flex-1">
              {source.filename}
            </span>
          </div>
          <ScoreBar score={source.score} compact />
          <p className="text-fg-muted text-[11px] leading-relaxed mt-1.5">{snippet}</p>
          <div className="mt-2 pt-1.5 border-t border-line">
            <span className="font-mono text-[9px] text-fg-muted">Click to jump to source</span>
          </div>
          <div className="absolute left-1/2 -translate-x-1/2 -bottom-[5px] w-2.5 h-2.5 bg-surface border-r border-b border-line rotate-45" />
        </div>
      )}
    </span>
  );
}
