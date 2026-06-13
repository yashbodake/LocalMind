import { useState, useEffect } from "react";
import { ChevronDown } from "lucide-react";
import { getModels } from "../hooks/useChat";

export default function ModelSelector({ selected, onSelect }) {
  const [models, setModels] = useState([]);
  const [defaultModel, setDefaultModel] = useState("");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    getModels()
      .then((data) => {
        setModels(data.models || []);
        setDefaultModel(data.default || "");
        if (!selected) {
          onSelect(data.default);
        }
      })
      .catch(() => {});
  }, []);

  const display = selected || defaultModel;
  const shortName = display.split("/").pop();

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-mono text-accent bg-accent/5 border border-line rounded-lg hover:border-accent/20 transition-colors"
      >
        {shortName}
        <ChevronDown size={11} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute bottom-full left-0 mb-1 z-20 bg-surface border border-line rounded-lg shadow-xl min-w-[240px] max-h-64 overflow-y-auto">
            {models.map((m) => (
              <button
                key={m}
                onClick={() => {
                  onSelect(m);
                  setOpen(false);
                }}
                className={`w-full text-left px-3 py-2 text-xs font-mono hover:bg-elevated transition-colors border-b border-line last:border-0
                  ${m === selected ? "text-accent font-medium" : "text-fg-secondary"}`}
              >
                {m.split("/").pop()}
                <span className="text-fg-muted ml-1.5">({m.split("/")[0]})</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
