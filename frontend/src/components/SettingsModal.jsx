import { useState, useEffect } from "react";
import { X, Settings, AlertTriangle, Loader2 } from "lucide-react";
import { getSettings, updateSettings, getModels, reembedAll } from "../hooks/useChat";

function SettingSlider({ label, value, defaultValue, onChange, onReset, overridden, min, max, step }) {
  const rawValue = value !== "" && value != null ? value : defaultValue;
  const numValue = parseFloat(rawValue) || 0;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className="text-fg-secondary text-xs font-sans">{label}</span>
          {overridden && (
            <button
              onClick={onReset}
              className="text-[9px] text-accent hover:text-accent/80 font-sans"
            >
              reset
            </button>
          )}
        </div>
        <span className="font-mono text-[10px] text-accent">{value || defaultValue}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={numValue}
        onChange={(e) => onChange(e.target.value)}
        className="w-full accent-accent h-1"
        aria-label={label}
      />
    </div>
  );
}

export default function SettingsModal({ onClose }) {
  const [settings, setSettings] = useState({});
  const [defaults, setDefaults] = useState({});
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);
  const [models, setModels] = useState([]);
  const [presetModel, setPresetModel] = useState("");
  const [reembedding, setReembedding] = useState(false);
  const [reembedMsg, setReembedMsg] = useState(null);

  useEffect(() => {
    getSettings()
      .then((data) => {
        setSettings(data.effective || {});
        setDefaults(data.defaults || {});
      })
      .catch(() => setError(true))
      .finally(() => setLoaded(true));
    getModels()
      .then((data) => setModels(data.models || []))
      .catch(() => {});
  }, []);

  const handleChange = (key, value) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateSettings({ settings });
      onClose();
    } catch (e) {
      console.error("Failed to save settings:", e);
    } finally {
      setSaving(false);
    }
  };

  const handleReset = (key) => {
    handleChange(key, String(defaults[key] ?? ""));
  };

  const isOverridden = (key) => settings[key] !== String(defaults[key] ?? "");

  const embeddingModels = [
    "BAAI/bge-small-en-v1.5",
    "BAAI/bge-base-en-v1.5",
    "BAAI/bge-large-en-v1.5",
    "sentence-transformers/all-MiniLM-L6-v2",
    "sentence-transformers/all-mpnet-base-v2",
  ];

  const handleReembed = async () => {
    setReembedding(true);
    setReembedMsg(null);
    try {
      await updateSettings({ settings });
      const result = await reembedAll();
      setReembedMsg({
        type: "success",
        text: `Re-embedded ${result.reembedded} document(s)${result.errors?.length ? ` (${result.errors.length} failed)` : ""}`,
      });
    } catch (e) {
      setReembedMsg({ type: "error", text: "Re-embed failed. Check server logs." });
    } finally {
      setReembedding(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-surface border border-line rounded-2xl w-full max-w-lg max-h-[85vh] flex flex-col mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-5 py-3 border-b border-line">
          <Settings size={16} className="text-accent" aria-hidden="true" />
          <h3 className="text-fg text-sm font-semibold">Settings</h3>
          <button
            onClick={onClose}
            className="ml-auto p-1.5 rounded-lg text-fg-muted hover:text-fg hover:bg-elevated transition-colors"
            aria-label="Close settings"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6">
          {!loaded ? (
            <p className="text-fg-muted text-sm">Loading…</p>
          ) : error ? (
            <p className="text-accent text-sm">Failed to load settings. Please try again.</p>
          ) : (
            <>
              <div className="space-y-3">
                <h4 className="font-mono text-[10px] uppercase tracking-wider text-fg-muted">Retrieval</h4>
                <SettingSlider
                  label="Top K"
                  value={settings["retrieval.top_k"] || ""}
                  defaultValue={defaults["retrieval.top_k"]}
                  onChange={(v) => handleChange("retrieval.top_k", v)}
                  onReset={() => handleReset("retrieval.top_k")}
                  overridden={isOverridden("retrieval.top_k")}
                  min={1} max={20} step={1}
                />
                <SettingSlider
                  label="Similarity Threshold"
                  value={settings["retrieval.similarity_threshold"] || ""}
                  defaultValue={defaults["retrieval.similarity_threshold"]}
                  onChange={(v) => handleChange("retrieval.similarity_threshold", v)}
                  onReset={() => handleReset("retrieval.similarity_threshold")}
                  overridden={isOverridden("retrieval.similarity_threshold")}
                  min={0} max={1} step={0.05}
                />
              </div>

              <div className="space-y-3">
                <h4 className="font-mono text-[10px] uppercase tracking-wider text-fg-muted">Generation</h4>
                <SettingSlider
                  label="Temperature"
                  value={settings["llm.temperature"] || ""}
                  defaultValue={defaults["llm.temperature"]}
                  onChange={(v) => handleChange("llm.temperature", v)}
                  onReset={() => handleReset("llm.temperature")}
                  overridden={isOverridden("llm.temperature")}
                  min={0} max={2} step={0.1}
                />
                <SettingSlider
                  label="Max Tokens"
                  value={settings["llm.max_tokens"] || ""}
                  defaultValue={defaults["llm.max_tokens"]}
                  onChange={(v) => handleChange("llm.max_tokens", v)}
                  onReset={() => handleReset("llm.max_tokens")}
                  overridden={isOverridden("llm.max_tokens")}
                  min={128} max={4096} step={128}
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="font-mono text-[10px] uppercase tracking-wider text-fg-muted">System Prompt Override</h4>
                  {isOverridden("llm.system_prompt") && (
                    <button
                      onClick={() => handleReset("llm.system_prompt")}
                      className="text-[10px] text-accent hover:text-accent/80 font-sans"
                    >
                      Reset
                    </button>
                  )}
                </div>
                <textarea
                  value={settings["llm.system_prompt"] || ""}
                  onChange={(e) => handleChange("llm.system_prompt", e.target.value)}
                  placeholder="Leave empty to use default system prompt…"
                  rows={4}
                  className="w-full bg-base border border-line rounded-lg px-3 py-2 text-fg text-xs outline-none focus:border-accent/30 resize-none font-mono"
                  aria-label="Custom system prompt"
                />
              </div>

              <div className="space-y-3">
                <h4 className="font-mono text-[10px] uppercase tracking-wider text-fg-muted">Ingestion (new uploads only)</h4>
                <SettingSlider
                  label="Chunk Size"
                  value={settings["chunking.chunk_size"] || ""}
                  defaultValue={defaults["chunking.chunk_size"]}
                  onChange={(v) => handleChange("chunking.chunk_size", v)}
                  onReset={() => handleReset("chunking.chunk_size")}
                  overridden={isOverridden("chunking.chunk_size")}
                  min={128} max={2048} step={64}
                />
                <SettingSlider
                  label="Chunk Overlap"
                  value={settings["chunking.chunk_overlap"] || ""}
                  defaultValue={defaults["chunking.chunk_overlap"]}
                  onChange={(v) => handleChange("chunking.chunk_overlap", v)}
                  onReset={() => handleReset("chunking.chunk_overlap")}
                  overridden={isOverridden("chunking.chunk_overlap")}
                  min={0} max={512} step={32}
                />
              </div>

              <div className="space-y-3">
                <h4 className="font-mono text-[10px] uppercase tracking-wider text-fg-muted">Model Presets</h4>
                <p className="text-[10px] text-fg-muted">Set per-model overrides. Takes priority over global Generation settings.</p>
                <select
                  value={presetModel}
                  onChange={(e) => setPresetModel(e.target.value)}
                  className="w-full bg-base border border-line rounded-lg px-2 py-1.5 text-fg text-xs outline-none focus:border-accent/30"
                  aria-label="Select model for preset"
                >
                  <option value="">Select a model…</option>
                  {models.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
                {presetModel && (
                  <div className="space-y-3 pt-1">
                    <SettingSlider
                      label="Temperature"
                      value={settings[`llm.temperature.${presetModel}`] || ""}
                      defaultValue={defaults["llm.temperature"]}
                      onChange={(v) => handleChange(`llm.temperature.${presetModel}`, v)}
                      onReset={() => setSettings((prev) => {
                        const next = { ...prev };
                        delete next[`llm.temperature.${presetModel}`];
                        return next;
                      })}
                      overridden={settings[`llm.temperature.${presetModel}`] != null && settings[`llm.temperature.${presetModel}`] !== ""}
                      min={0} max={2} step={0.1}
                    />
                    <SettingSlider
                      label="Max Tokens"
                      value={settings[`llm.max_tokens.${presetModel}`] || ""}
                      defaultValue={defaults["llm.max_tokens"]}
                      onChange={(v) => handleChange(`llm.max_tokens.${presetModel}`, v)}
                      onReset={() => setSettings((prev) => {
                        const next = { ...prev };
                        delete next[`llm.max_tokens.${presetModel}`];
                        return next;
                      })}
                      overridden={settings[`llm.max_tokens.${presetModel}`] != null && settings[`llm.max_tokens.${presetModel}`] !== ""}
                      min={128} max={4096} step={128}
                    />
                  </div>
                )}
              </div>

              <div className="space-y-3">
                <h4 className="font-mono text-[10px] uppercase tracking-wider text-fg-muted">Embedding Model</h4>
                <div className="flex items-start gap-2 p-2 rounded-lg bg-warning/10 border border-warning/20">
                  <AlertTriangle size={14} className="text-warning shrink-0 mt-0.5" aria-hidden="true" />
                  <p className="text-[10px] text-fg-secondary">
                    Changing the embedding model requires re-embedding all documents. New model downloads on first use.
                  </p>
                </div>
                <select
                  value={settings["embedding.model"] || ""}
                  onChange={(e) => handleChange("embedding.model", e.target.value)}
                  className="w-full bg-base border border-line rounded-lg px-2 py-1.5 text-fg text-xs outline-none focus:border-accent/30"
                  aria-label="Select embedding model"
                >
                  {embeddingModels.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
                {reembedMsg && (
                  <p className={`text-[10px] ${reembedMsg.type === "success" ? "text-accent" : "text-warning"}`}>
                    {reembedMsg.text}
                  </p>
                )}
                <button
                  onClick={handleReembed}
                  disabled={reembedding}
                  className="flex items-center gap-1.5 px-3 py-1.5 border border-accent/30 bg-accent/10 rounded-lg text-accent text-xs disabled:opacity-30 transition-colors"
                >
                  {reembedding ? (
                    <><Loader2 size={12} className="animate-spin" aria-hidden="true" /> Re-embedding…</>
                  ) : (
                    "Save & Re-embed All"
                  )}
                </button>
              </div>
            </>
          )}
        </div>

        <div className="flex justify-end gap-2 px-5 py-3 border-t border-line">
          <button
            onClick={onClose}
            className="px-3 py-1.5 border border-line rounded-lg text-fg-muted hover:text-fg text-xs transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !loaded || error}
            className="px-3 py-1.5 border border-accent/30 bg-accent/10 rounded-lg text-accent text-xs disabled:opacity-30 transition-colors"
          >
            {saving ? "Saving…" : "Save Settings"}
          </button>
        </div>
      </div>
    </div>
  );
}
