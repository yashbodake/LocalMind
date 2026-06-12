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

  const onDragOver = (e) => {
    e.preventDefault();
    setDragging(true);
  };

  const onDragLeave = () => setDragging(false);

  return (
    <div>
      <div
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onClick={() => !uploading && inputRef.current?.click()}
        className={`border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors ${
          dragging
            ? "border-blue-400 bg-blue-50"
            : "border-gray-300 hover:border-gray-400"
        } ${uploading ? "opacity-60 cursor-wait" : ""}`}
      >
        <UploadCloud
          size={20}
          className={`mx-auto mb-1.5 ${dragging ? "text-blue-500" : "text-gray-400"}`}
        />
        <p className="text-xs text-gray-600">
          {uploading ? "Uploading..." : "Drop files or click to browse"}
        </p>
        <p className="text-xs text-gray-400 mt-0.5">.pdf, .md, .txt</p>
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.md,.txt"
          multiple
          className="hidden"
          onChange={(e) => handleFiles(Array.from(e.target.files))}
        />
      </div>

      {uploading && (
        <div className="mt-2 h-1.5 bg-gray-200 rounded-full overflow-hidden">
          <div
            className="h-full bg-blue-500 rounded-full transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}

      {error && (
        <div className="mt-2 flex items-center gap-1.5 text-xs text-red-600">
          <AlertCircle size={12} />
          {error}
        </div>
      )}

      {successMsg && (
        <div className="mt-2 flex items-center gap-1.5 text-xs text-green-600">
          <CheckCircle size={12} />
          {successMsg}
        </div>
      )}
    </div>
  );
}
