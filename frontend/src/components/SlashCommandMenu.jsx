import { Slash } from "lucide-react";

export default function SlashCommandMenu({ commands, selectedIndex, onSelect }) {
  return (
    <div className="absolute bottom-full left-0 right-0 mb-2 bg-surface border border-line rounded-lg shadow-xl z-30 max-h-[200px] overflow-y-auto">
      <div className="px-3 py-1.5 border-b border-line">
        <span className="font-mono text-[9px] font-semibold uppercase tracking-wider text-fg-muted">
          Commands
        </span>
      </div>
      <ul role="listbox">
        {commands.map((cmd, i) => (
          <li key={cmd.cmd} role="option" aria-selected={i === selectedIndex}>
            <button
              type="button"
              onClick={() => onSelect(cmd)}
              className={`w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors ${
                i === selectedIndex ? "bg-accent/10" : "hover:bg-elevated"
              }`}
            >
              <Slash size={12} className="text-accent shrink-0" aria-hidden="true" />
              <div className="min-w-0">
                <p className="font-mono text-xs text-fg-secondary">{cmd.cmd}</p>
                <p className="text-[10px] text-fg-muted truncate">{cmd.description}</p>
              </div>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
