export function exportToMarkdown(session, messages) {
  const lines = [];
  lines.push(`# ${session?.title || "Conversation"}`);
  lines.push("");
  lines.push(`Exported: ${new Date().toLocaleString()}`);
  lines.push("");

  for (const msg of messages) {
    if (msg.role === "user") {
      lines.push("## Question");
      lines.push("");
      lines.push(msg.content);
      lines.push("");
    } else {
      lines.push("## Answer");
      lines.push("");
      lines.push(msg.content);
      lines.push("");
      if (msg.latencyMs) {
        lines.push(`> Latency: ${msg.latencyMs}ms`);
        lines.push("");
      }
      if (msg.sources && msg.sources.length > 0) {
        lines.push("### Sources");
        lines.push("");
        msg.sources.forEach((src, i) => {
          lines.push(`${i + 1}. **${src.filename}** (chunk ${src.chunk_index}, score: ${src.score?.toFixed(2) || "N/A"})`);
        });
        lines.push("");
      }
      if (msg.followups && msg.followups.length > 0) {
        lines.push("### Suggested Follow-ups");
        lines.push("");
        msg.followups.forEach((q) => lines.push(`- ${q}`));
        lines.push("");
      }
    }
    lines.push("---");
    lines.push("");
  }

  const blob = new Blob([lines.join("\n")], { type: "text/markdown" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const safeName = (session?.title || "conversation").replace(/[^a-z0-9]/gi, "-").toLowerCase();
  a.download = `${safeName || "conversation"}.md`;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportToJSON(session, messages) {
  const data = {
    title: session?.title || "Conversation",
    id: session?.id,
    exported_at: new Date().toISOString(),
    messages: messages.map((m) => ({
      role: m.role,
      content: m.content,
      latency_ms: m.latencyMs || null,
      sources: m.sources || [],
      followups: m.followups || null,
      feedback: m.feedback || null,
    })),
  };

  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const safeName = (session?.title || "conversation").replace(/[^a-z0-9]/gi, "-").toLowerCase();
  a.download = `${safeName || "conversation"}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportToPDF(session, messages) {
  const printWindow = window.open("", "_blank");
  if (!printWindow) return;

  const title = session?.title || "Conversation";
  let html = `<!DOCTYPE html><html><head><title>${title}</title><style>
    body { font-family: -apple-system, system-ui, sans-serif; max-width: 700px; margin: 0 auto; padding: 20px; color: #1a1a1a; }
    h1 { font-size: 1.4em; border-bottom: 1px solid #ccc; padding-bottom: 8px; }
    h2 { font-size: 1.1em; margin-top: 24px; color: #555; }
    .message { margin-bottom: 16px; page-break-inside: avoid; }
    .meta { font-size: 0.75em; color: #999; }
    pre { background: #f5f5f5; padding: 8px; border-radius: 4px; overflow-x: auto; font-size: 0.85em; }
    code { font-family: monospace; }
    .source { font-size: 0.8em; color: #666; margin-left: 12px; }
  </style></head><body><h1>${title}</h1>`;

  for (const msg of messages) {
    const escaped = msg.content
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

    if (msg.role === "user") {
      html += `<div class="message"><h2>Q: ${escaped}</h2></div>`;
    } else {
      html += `<div class="message"><h2>A:</h2><div>${escaped.replace(/\n/g, "<br>")}</div>`;
      if (msg.latencyMs) html += `<div class="meta">Latency: ${msg.latencyMs}ms</div>`;
      if (msg.sources?.length > 0) {
        html += `<div class="meta">Sources: ${msg.sources.map((s) => s.filename).join(", ")}</div>`;
      }
      html += `</div>`;
    }
  }

  html += `</body></html>`;
  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.focus();
  setTimeout(() => printWindow.print(), 500);
}
