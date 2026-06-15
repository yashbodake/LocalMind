import { useState, useEffect } from "react";
import { RefreshCw, Trash2, FileText, AlertCircle, Plus, X, MessageSquare, Pencil, Check, Settings as SettingsIcon, Pin, Search } from "lucide-react";
import { getSources, deleteSource, updateSession, deleteSession, bulkDeleteSources, ingestText } from "../hooks/useChat";
import FileUploader from "./FileUploader";
import DocumentPreview from "./DocumentPreview";
import TextPasteModal from "./TextPasteModal";
import SettingsModal from "./SettingsModal";
import BrandLogo from "./BrandLogo";
import SystemStatus from "./SystemStatus";
import ThemeToggle from "./ThemeToggle";

export default function Sidebar({
  sessions,
  currentSessionId,
  onSwitchSession,
  onSessionUpdate,
  onSessionDelete,
  onNewChat,
  selectedDocIds,
  onSelectDocIds,
  sidebarOpen,
  onCloseSidebar,
  theme,
  onToggleTheme,
  onSourcesUpdate,
}) {
  const [sources, setSources] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [editingSessionId, setEditingSessionId] = useState(null);
  const [editTitle, setEditTitle] = useState("");
  const [previewDoc, setPreviewDoc] = useState(null);
  const [showPasteModal, setShowPasteModal] = useState(false);
  const [bulkMode, setBulkMode] = useState(false);
  const [bulkSelected, setBulkSelected] = useState(new Set());
  const [showSettings, setShowSettings] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getSources();
      setSources(data.sources || []);
      onSourcesUpdate?.(data.sources || []);
    } catch {
      setError("Failed to load sources");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const handleDelete = async (docId) => {
    setDeleting(docId);
    try {
      await deleteSource(docId);
      setSources((prev) => prev.filter((s) => s.doc_id !== docId));
    } catch {
      setError("Failed to delete source");
    } finally {
      setDeleting(null);
    }
  };

  const toggleDoc = (docId) => {
    if (!selectedDocIds) return;
    if (selectedDocIds.includes(docId)) {
      onSelectDocIds(selectedDocIds.filter((id) => id !== docId));
    } else {
      onSelectDocIds([...selectedDocIds, docId]);
    }
  };

  const allSelected = () => {
    if (!selectedDocIds || sources.length === 0) return false;
    return sources.every((s) => selectedDocIds.includes(s.doc_id));
  };

  const toggleAll = () => {
    if (allSelected()) {
      onSelectDocIds([]);
    } else {
      onSelectDocIds(sources.map((s) => s.doc_id));
    }
  };

  const toggleBulk = (docId) => {
    setBulkSelected((prev) => {
      const next = new Set(prev);
      if (next.has(docId)) next.delete(docId);
      else next.add(docId);
      return next;
    });
  };

  const handleBulkDelete = async () => {
    const ids = Array.from(bulkSelected);
    if (ids.length === 0) return;
    if (!window.confirm(`Delete ${ids.length} document${ids.length !== 1 ? "s" : ""}?`)) return;
    try {
      await bulkDeleteSources(ids);
      setBulkSelected(new Set());
      setBulkMode(false);
      refresh();
    } catch (e) {
      console.error("Bulk delete failed:", e);
    }
  };

  const handlePasteSubmit = async ({ title, text }) => {
    await ingestText(title, text);
    refresh();
  };

  const startRename = (session) => {
    setEditingSessionId(session.id);
    setEditTitle(session.title);
  };

  const confirmRename = async (sessionId) => {
    const title = editTitle.trim();
    if (!title) {
      setEditingSessionId(null);
      return;
    }
    try {
      await updateSession(sessionId, { title });
      onSessionUpdate(sessionId, { title });
    } catch {}
    setEditingSessionId(null);
  };

  const handleSessionDelete = async (sessionId) => {
    if (!window.confirm("Delete this conversation?")) return;
    try {
      await deleteSession(sessionId);
      onSessionDelete(sessionId);
    } catch {}
  };

  const timeAgo = (isoString) => {
    const diff = Date.now() - new Date(isoString).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "now";
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;
    return new Date(isoString).toLocaleDateString();
  };

  const totalChunks = sources.reduce((sum, s) => sum + s.chunks, 0);

  const filteredSessions = searchQuery
    ? sessions.filter((s) => s.title.toLowerCase().includes(searchQuery.toLowerCase()))
    : sessions;

  const handlePinToggle = (s) => {
    const oldPinned = s.pinned;
    const newPinned = oldPinned ? 0 : 1;
    onSessionUpdate(s.id, { pinned: newPinned });
    updateSession(s.id, { pinned: newPinned }).catch((err) => {
      console.error("Pin toggle failed:", err);
      onSessionUpdate(s.id, { pinned: oldPinned });
    });
  };

  return (
    <>
      {sidebarOpen && (
        <button
          className="fixed inset-0 bg-black/50 z-30 md:hidden"
          onClick={onCloseSidebar}
          aria-label="Close sidebar"
          tabIndex={-1}
        />
      )}
      <aside
        className={`w-[248px] bg-surface border-r border-line flex flex-col h-full shrink-0 z-40 transition-transform duration-200 overscroll-contain
        ${sidebarOpen ? "fixed md:relative translate-x-0" : "fixed md:relative -translate-x-full md:translate-x-0"}`}
      >
        <div className="p-4 border-b border-line flex items-center justify-between">
          <BrandLogo />
          <div className="flex items-center gap-2">
            <ThemeToggle theme={theme} onToggle={onToggleTheme} />
            <button
              onClick={onCloseSidebar}
              className="md:hidden p-1.5 rounded-lg text-fg-muted hover:text-fg-secondary"
              aria-label="Close sidebar"
            >
              <X size={16} aria-hidden="true" />
            </button>
          </div>
        </div>

        <div className="px-3 py-2.5">
          <button
            onClick={onNewChat}
            className="w-full flex items-center gap-2 px-3 py-2 border border-line rounded-lg text-fg-secondary hover:border-accent/30 hover:text-accent text-xs font-mono transition-colors"
          >
            <Plus size={14} aria-hidden="true" />
            new --chat
          </button>
          {sessions.length > 5 && (
            <div className="relative mt-2">
              <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-fg-muted" aria-hidden="true" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search sessions…"
                aria-label="Search sessions"
                className="w-full bg-elevated border border-line rounded-lg pl-7 pr-2.5 py-1.5 text-fg text-xs font-sans placeholder:text-fg-muted outline-none focus:border-accent/30"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 text-fg-muted hover:text-fg"
                  aria-label="Clear search"
                >
                  <X size={11} aria-hidden="true" />
                </button>
              )}
            </div>
          )}
        </div>

        <div className="px-4 py-1">
          <span className="font-mono text-[9px] font-semibold uppercase tracking-wider text-fg-muted">
            // sessions ({sessions.length})
          </span>
        </div>
        <div className="flex-1 overflow-y-auto overscroll-contain px-2 min-h-0">
          {filteredSessions.length === 0 ? (
            <p className="text-xs text-fg-muted text-center py-4 px-2">
              {searchQuery ? "No sessions found" : "No conversations yet"}
            </p>
          ) : (
            <ul className="space-y-0.5">
              {filteredSessions.map((s) => (
                <li
                  key={s.id}
                  className={`group flex items-center gap-2 px-2.5 py-2 rounded-lg border border-transparent transition-colors
                    ${s.id === currentSessionId ? "bg-accent/5 border-accent/20" : "hover:bg-elevated"}`}
                >
                  <MessageSquare size={13} className="text-fg-muted shrink-0" aria-hidden="true" />
                  {editingSessionId === s.id ? (
                    <>
                      <input
                        type="text"
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") confirmRename(s.id);
                          if (e.key === "Escape") setEditingSessionId(null);
                        }}
                        onClick={(e) => e.stopPropagation()}
                        autoFocus
                        aria-label="Session title"
                        className="flex-1 min-w-0 bg-elevated text-fg text-xs font-sans rounded px-1.5 py-0.5 outline-none border border-accent/30"
                      />
                      <button
                        onClick={() => confirmRename(s.id)}
                        className="p-1 rounded hover:bg-accent/10 text-accent shrink-0"
                        aria-label="Confirm rename"
                      >
                        <Check size={12} aria-hidden="true" />
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => onSwitchSession(s.id)}
                        className="flex-1 min-w-0 text-left"
                        aria-label={`Open session: ${s.title}`}
                        aria-current={s.id === currentSessionId ? "true" : undefined}
                      >
                        <p className="text-xs text-fg-secondary truncate">{s.title}</p>
                        <p className="font-mono text-[9px] text-fg-muted">{timeAgo(s.updated_at)}</p>
                      </button>
                      <div className={`flex items-center transition-opacity shrink-0 ${s.pinned ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}>
                        <button
                          onClick={() => handlePinToggle(s)}
                          className={`p-1 rounded hover:bg-accent/10 ${s.pinned ? "text-accent" : "text-fg-muted hover:text-accent"}`}
                          aria-label={s.pinned ? "Unpin session" : "Pin session"}
                          aria-pressed={s.pinned ? "true" : "false"}
                        >
                          <Pin size={11} aria-hidden="true" />
                        </button>
                        <button
                          onClick={() => startRename(s)}
                          className="p-1 rounded hover:bg-accent/10 text-fg-muted hover:text-accent"
                          aria-label={`Rename ${s.title}`}
                        >
                          <Pencil size={11} aria-hidden="true" />
                        </button>
                        <button
                          onClick={() => handleSessionDelete(s.id)}
                          className="p-1 rounded hover:bg-accent/10 text-fg-muted hover:text-accent"
                          aria-label={`Delete ${s.title}`}
                        >
                          <Trash2 size={11} aria-hidden="true" />
                        </button>
                      </div>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="px-4 py-1 border-t border-line">
          <FileUploader onSuccess={refresh} />
          <button
            onClick={() => setShowPasteModal(true)}
            className="w-full py-1.5 mt-2 text-[11px] font-sans text-fg-muted hover:text-accent border border-line rounded-lg transition-colors"
          >
            + Paste Text
          </button>
        </div>

        {error && (
          <div className="mx-3 mb-2 flex items-center gap-1.5 text-xs text-accent bg-accent/5 border border-accent/20 rounded-md px-3 py-2">
            <AlertCircle size={12} className="shrink-0" aria-hidden="true" />
            {error}
          </div>
        )}

        <div className="px-4 py-1 flex items-center justify-between">
          <span className="font-mono text-[9px] font-semibold uppercase tracking-wider text-fg-muted">
            // sources ({sources.length})
          </span>
          <div className="flex items-center">
            {sources.length > 0 && !bulkMode && (
              <button
                onClick={toggleAll}
                className="text-[10px] font-mono text-fg-muted hover:text-accent transition-colors"
              >
                {allSelected() ? "deselect all" : "select all"}
              </button>
            )}
            <button
              onClick={() => { setBulkMode(!bulkMode); setBulkSelected(new Set()); }}
              className={`text-[10px] font-mono transition-colors ${sources.length > 0 && !bulkMode ? "ml-2" : ""} ${bulkMode ? "text-accent" : "text-fg-muted hover:text-fg-secondary"}`}
            >
              {bulkMode ? "Cancel" : "Bulk"}
            </button>
            {bulkMode && bulkSelected.size > 0 && (
              <button
                onClick={handleBulkDelete}
                className="text-[10px] text-accent hover:text-accent/80 font-sans ml-2"
              >
                Delete ({bulkSelected.size})
              </button>
            )}
          </div>
        </div>

        <div className="overflow-y-auto overscroll-contain px-2 pb-2 max-h-[240px]">
          {sources.length === 0 && !loading ? (
            <p className="text-xs text-fg-muted text-center py-8 px-4">
              Upload documents to get started
            </p>
          ) : (
            <ul className="space-y-0.5">
              {sources.map((s) => {
                const isChecked = selectedDocIds?.includes(s.doc_id);
                return (
                  <li
                    key={s.doc_id}
                    className={`group flex items-center gap-2.5 px-2.5 py-2 rounded-lg border border-transparent
                      ${bulkMode ? "hover:bg-elevated" : isChecked ? "bg-accent/5 hover:bg-accent/8" : "opacity-40 hover:opacity-70 hover:bg-elevated"}`}
                  >
                    {bulkMode ? (
                      <input
                        type="checkbox"
                        checked={bulkSelected.has(s.doc_id)}
                        onChange={() => toggleBulk(s.doc_id)}
                        className="accent-accent w-3 h-3 shrink-0"
                        aria-label={`Select ${s.filename} for deletion`}
                      />
                    ) : (
                      <button
                        type="button"
                        role="checkbox"
                        aria-checked={isChecked}
                        aria-label={`Toggle source: ${s.filename}`}
                        className="shrink-0 cursor-pointer"
                        onClick={() => toggleDoc(s.doc_id)}
                      >
                        <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center transition-colors
                          ${isChecked ? "bg-accent/15 border-accent" : "border-line-hover"}`}>
                          {isChecked && (
                            <svg width="8" height="6" viewBox="0 0 8 6" fill="none" aria-hidden="true">
                              <path d="M1 3L3 5L7 1" stroke="#22d3ee" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          )}
                        </div>
                      </button>
                    )}
                    <FileText size={14} className="text-fg-muted shrink-0" aria-hidden="true" />
                    <button
                      onClick={() => !bulkMode && setPreviewDoc({ docId: s.doc_id, filename: s.filename })}
                      className="text-fg-secondary text-xs font-medium truncate hover:text-accent transition-colors text-left min-w-0 flex-1"
                    >
                      {s.filename}
                    </button>
                    <span className="font-mono text-[10px] text-fg-muted shrink-0">{s.chunks}ch</span>
                    {s.file_type && s.file_type !== "unknown" && (
                      <span className="font-mono text-[9px] text-fg-muted uppercase">{s.file_type}</span>
                    )}
                    {s.size_kb > 0 && (
                      <span className="font-mono text-[9px] text-fg-muted">
                        {s.size_kb < 1024 ? `${s.size_kb.toFixed(1)}KB` : `${(s.size_kb / 1024).toFixed(1)}MB`}
                      </span>
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (window.confirm(`Delete "${s.filename}"?`)) {
                          handleDelete(s.doc_id);
                        }
                      }}
                      disabled={deleting === s.doc_id}
                      className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-accent/10 text-fg-muted hover:text-accent transition-opacity shrink-0"
                      aria-label={`Delete ${s.filename}`}
                    >
                      <Trash2 size={12} className={deleting === s.doc_id ? "animate-spin" : ""} aria-hidden="true" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="px-4 py-3 border-t border-line">
          <div className="flex items-center justify-between mb-2.5">
            <button
              onClick={refresh}
              disabled={loading}
              className="flex items-center gap-1.5 text-[10px] font-mono text-fg-muted hover:text-accent transition-colors"
            >
              <RefreshCw size={11} className={loading ? "animate-spin" : ""} aria-hidden="true" />
              refresh
            </button>
            <button
              onClick={() => setShowSettings(true)}
              className="flex items-center gap-1.5 px-2.5 py-1 text-fg-muted hover:text-accent text-[11px] font-sans transition-colors"
              aria-label="Open settings"
            >
              <SettingsIcon size={12} aria-hidden="true" />
              Settings
            </button>
          </div>
          <SystemStatus vectorCount={totalChunks} />
        </div>
      </aside>
      {previewDoc && (
        <DocumentPreview
          docId={previewDoc.docId}
          filename={previewDoc.filename}
          onClose={() => setPreviewDoc(null)}
        />
      )}
      {showPasteModal && (
        <TextPasteModal
          onClose={() => setShowPasteModal(false)}
          onSubmit={handlePasteSubmit}
        />
      )}
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
    </>
  );
}
