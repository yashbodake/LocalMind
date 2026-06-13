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
