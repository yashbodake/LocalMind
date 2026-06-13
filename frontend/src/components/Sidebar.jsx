import { useState, useEffect } from "react";
import { RefreshCw, Trash2, FileText, AlertCircle } from "lucide-react";
import { getSources, deleteSource } from "../hooks/useChat";
import FileUploader from "./FileUploader";

export default function Sidebar({ onUploadSuccess, selectedDocIds, onSelectDocIds }) {
  const [sources, setSources] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [deleting, setDeleting] = useState(null);

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getSources();
      setSources(data.sources || []);
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

  const handleUploadSuccess = (result) => {
    refresh();
    onUploadSuccess?.(result);
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

  return (
    <aside className="w-72 border-r border-gray-200 bg-white flex flex-col h-full">
      <div className="p-4 border-b border-gray-200 flex items-center justify-between">
        <h2 className="font-semibold text-gray-800 text-sm">Sources</h2>
        <div className="flex items-center gap-2">
          {sources.length > 0 && (
            <button
              onClick={toggleAll}
              className="text-xs text-gray-500 hover:text-gray-700 transition-colors"
              title="Toggle all"
            >
              {allSelected() ? "Deselect all" : "Select all"}
            </button>
          )}
          <button
            onClick={refresh}
            disabled={loading}
            className="p-1.5 rounded hover:bg-gray-100 text-gray-500 transition-colors"
            title="Refresh"
          >
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      <div className="p-4">
        <FileUploader onSuccess={handleUploadSuccess} />
      </div>

      {error && (
        <div className="mx-4 mb-2 flex items-center gap-1.5 text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
          <AlertCircle size={12} className="shrink-0" />
          {error}
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-4 pb-4">
        {sources.length === 0 && !loading ? (
          <p className="text-sm text-gray-400 text-center py-8">
            No documents yet
          </p>
        ) : (
          <ul className="space-y-2">
            {sources.map((s) => {
              const isChecked = selectedDocIds?.includes(s.doc_id);
              return (
                <li
                  key={s.doc_id}
                  className={`flex items-center gap-2 p-2 rounded-lg hover:bg-gray-50 group ${
                    isChecked ? "" : "opacity-40"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={isChecked || false}
                    onChange={() => toggleDoc(s.doc_id)}
                    className="w-3.5 h-3.5 rounded shrink-0 accent-blue-600"
                  />
                  <FileText size={16} className="text-gray-400 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-gray-700 truncate">{s.filename}</p>
                    <p className="text-xs text-gray-400">{s.chunks} chunks</p>
                  </div>
                  <button
                    onClick={() => handleDelete(s.doc_id)}
                    disabled={deleting === s.doc_id}
                    className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-500 transition-all disabled:opacity-100"
                    title="Delete"
                  >
                    <Trash2
                      size={14}
                      className={deleting === s.doc_id ? "animate-spin" : ""}
                    />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </aside>
  );
}
