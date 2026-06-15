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

export async function query(question, { history, model, doc_ids } = {}) {
  const res = await fetch(`${API_BASE}/query`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question, history, model, doc_ids }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Query failed");
  }
  return res.json();
}

export async function queryStream(
  question,
  { history, model, doc_ids },
  onChunk,
  onDone,
  onError,
  signal
) {
  try {
    const res = await fetch(`${API_BASE}/query/stream`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question, history, model, doc_ids }),
      signal,
    });

    if (!res.ok) {
      throw new Error("Stream request failed");
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop();

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          const data = line.slice(6);
          if (data === "[DONE]") {
            onDone();
            return;
          }
          onChunk(data);
        }
      }
    }
    onDone();
  } catch (err) {
    if (err.name !== "AbortError") {
      onError(err);
    }
  }
}

export async function getModels() {
  const res = await fetch(`${API_BASE}/models`);
  if (!res.ok) throw new Error("Failed to fetch models");
  return res.json();
}

export async function createSession({ title, model, doc_ids } = {}) {
  const res = await fetch(`${API_BASE}/sessions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title, model, doc_ids }),
  });
  if (!res.ok) throw new Error("Failed to create session");
  return res.json();
}

export async function getSessions() {
  const res = await fetch(`${API_BASE}/sessions`);
  if (!res.ok) throw new Error("Failed to fetch sessions");
  return res.json();
}

export async function getSession(id) {
  const res = await fetch(`${API_BASE}/sessions/${id}`);
  if (!res.ok) throw new Error("Failed to fetch session");
  return res.json();
}

export async function updateSession(id, { title, model, doc_ids, pinned }) {
  const res = await fetch(`${API_BASE}/sessions/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title, model, doc_ids, pinned }),
  });
  if (!res.ok) throw new Error("Failed to update session");
  return res.json();
}

export async function deleteSession(id) {
  const res = await fetch(`${API_BASE}/sessions/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error("Failed to delete session");
  return res.json();
}

export async function saveMessage(sessionId, { role, content, sources, latency_ms, model }) {
  const res = await fetch(`${API_BASE}/sessions/${sessionId}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ role, content, sources, latency_ms, model }),
  });
  if (!res.ok) throw new Error("Failed to save message");
  return res.json();
}

export async function truncateMessages(sessionId, fromIndex) {
  const res = await fetch(`${API_BASE}/sessions/${sessionId}/messages?from_index=${fromIndex}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error("Failed to truncate messages");
  return res.json();
}

export async function getDocumentContent(docId) {
  const res = await fetch(`${API_BASE}/sources/${docId}/content`);
  if (!res.ok) throw new Error("Failed to load document");
  return res.json();
}

export async function bulkDeleteSources(docIds) {
  const res = await fetch(`${API_BASE}/sources/bulk`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(docIds),
  });
  if (!res.ok) throw new Error("Failed to delete sources");
  return res.json();
}

export async function ingestText(title, text) {
  const res = await fetch(`${API_BASE}/ingest/text`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title, text }),
  });
  if (!res.ok) throw new Error("Failed to ingest text");
  return res.json();
}

export async function ingestURL(url, title) {
  const res = await fetch(`${API_BASE}/ingest/url`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url, title }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Failed to ingest URL");
  }
  return res.json();
}

export async function reingestDocument(docId) {
  const res = await fetch(`${API_BASE}/sources/${docId}/reingest`, { method: "POST" });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Failed to re-ingest");
  }
  return res.json();
}

export async function getSettings() {
  const res = await fetch(`${API_BASE}/settings`);
  if (!res.ok) throw new Error("Failed to load settings");
  return res.json();
}

export async function updateSettings(settings) {
  const res = await fetch(`${API_BASE}/settings`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(settings),
  });
  if (!res.ok) throw new Error("Failed to save settings");
  return res.json();
}

export async function updateFeedback(sessionId, messageId, feedback) {
  const res = await fetch(`${API_BASE}/sessions/${sessionId}/messages/${messageId}/feedback`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ feedback }),
  });
  if (!res.ok) throw new Error("Failed to update feedback");
  return res.json();
}

export async function reembedAll() {
  const res = await fetch(`${API_BASE}/sources/reembed-all`, { method: "POST" });
  if (!res.ok) throw new Error("Failed to re-embed documents");
  return res.json();
}
