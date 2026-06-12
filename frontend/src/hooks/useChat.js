const API_BASE = "";

export async function uploadFiles(files) {
  const formData = new FormData();
  for (const file of files) {
    formData.append("files", file);
  }
  const res = await fetch(`${API_BASE}/ingest`, {
    method: "POST",
    body: formData,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Upload failed");
  }
  return res.json();
}

export async function getSources() {
  const res = await fetch(`${API_BASE}/sources`);
  if (!res.ok) throw new Error("Failed to fetch sources");
  return res.json();
}

export async function deleteSource(id) {
  const res = await fetch(`${API_BASE}/sources/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error("Failed to delete source");
  return res.json();
}

export async function query(question) {
  const res = await fetch(`${API_BASE}/query`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Query failed");
  }
  return res.json();
}

export function queryStream(question, onChunk, onDone) {
  const source = new EventSource(
    `${API_BASE}/query/stream?q=${encodeURIComponent(question)}`
  );
  source.onmessage = (e) => {
    if (e.data === "[DONE]") {
      onDone();
      source.close();
      return;
    }
    onChunk(e.data);
  };
  source.onerror = () => {
    source.close();
  };
  return source;
}
