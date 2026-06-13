import { useState, useRef } from "react";
import { UploadCloud, CheckCircle, AlertCircle } from "lucide-react";
import { uploadFiles } from "../hooks/useChat";

export default function FileUploader({ onSuccess }) {
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);
  const inputRef = useRef(null);

  const handleFiles = async (files) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    setError(null);
    setSuccessMsg(null);
    setProgress(10);

    try {
      const result = await uploadFiles(files);
      setProgress(100);
      const count = result.ingested?.length || 0;
      setSuccessMsg(`${count} file${count !== 1 ? "s" : ""} ingested`);
      setTimeout(() => setSuccessMsg(null), 3000);
      onSuccess(result);
    } catch (e) {
      setError(e.message);
      setProgress(0);
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const onDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    handleFiles(Array.from(e.dataTransfer.files));
  };

  const onKey = (e) => {
    if ((e.key === "Enter" || e.key === " ") && !uploading) {
      e.preventDefault();
      inputRef.current?.click();
    }
  };

  return (
    <div>
      <div
        role="button"
        tabIndex={0}
        aria-label="Upload files — drop or click to browse"
        onDrop={onDrop}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onClick={() => !uploading && inputRef.current?.click()}
        onKeyDown={onKey}
        className={`border border-dashed rounded-lg p-3 text-center cursor-pointer transition-colors
          ${dragging ? "border-accent/40 bg-accent/5" : "border-line hover:border-line-hover"}`}
      >
        <UploadCloud
          size={18}
          aria-hidden="true"
          className={`mx-auto mb-1 ${dragging ? "text-accent" : "text-fg-muted"}`}
        />
        <p className="text-[11px] text-fg-secondary font-sans">
          {uploading ? "Uploading…" : "Drop files or click"}
        </p>
        <p className="text-[10px] text-fg-muted font-mono mt-0.5">.pdf .md .txt</p>
        <input
          ref={inputRef}
          type="file"
          name="documents"
          accept=".pdf,.md,.txt"
          multiple
          className="hidden"
          onChange={(e) => handleFiles(Array.from(e.target.files))}
        />
      </div>

      {uploading && (
        <div className="mt-2 h-1 bg-line rounded-full overflow-hidden">
          <div
            className="h-full bg-accent rounded-full transition-[width] duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}

      {error && (
        <div className="mt-2 flex items-center gap-1.5 text-[11px] text-accent font-sans">
          <AlertCircle size={11} aria-hidden="true" />
          {error}
        </div>
      )}

      {successMsg && (
        <div className="mt-2 flex items-center gap-1.5 text-[11px] text-green-500 font-sans">
          <CheckCircle size={11} aria-hidden="true" />
          {successMsg}
        </div>
      )}
    </div>
  );
}
