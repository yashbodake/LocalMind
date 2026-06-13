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
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
      >
        {shortName}
        <ChevronDown size={12} />
      </button>
      {open && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => setOpen(false)}
          />
          <div className="absolute top-full left-0 mt-1 z-20 bg-white border border-gray-200 rounded-lg shadow-lg min-w-[240px] max-h-64 overflow-y-auto">
            {models.map((m) => (
              <button
                key={m}
                onClick={() => {
                  onSelect(m);
                  setOpen(false);
                }}
                className={`w-full text-left px-3 py-2 text-xs hover:bg-gray-50 transition-colors ${
                  m === selected ? "text-blue-600 font-medium" : "text-gray-700"
                }`}
              >
                {m.split("/").pop()}
                <span className="text-gray-400 ml-1">({m.split("/")[0]})</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
