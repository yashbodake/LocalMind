export default function SystemStatus({ model, vectorCount, avgLatency }) {
  const rows = [
    { label: "model", value: model || "—" },
    { label: "reranker", value: "bge-reranker" },
    { label: "vectors", value: vectorCount != null ? `${vectorCount} indexed` : "—" },
    { label: "latency", value: avgLatency ? `~${avgLatency}ms` : "—" },
  ];

  return (
    <div className="flex flex-col gap-1.5 font-mono text-[10px]">
      {rows.map((row) => (
        <div key={row.label} className="flex justify-between">
          <span className="text-fg-muted">{row.label}</span>
          <span className="text-fg-secondary">{row.value}</span>
        </div>
      ))}
    </div>
  );
}
