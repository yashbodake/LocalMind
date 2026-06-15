import { useEffect, useRef, useState } from "react";
import mermaid from "mermaid";

mermaid.initialize({
  startOnLoad: false,
  theme: "dark",
  themeVariables: {
    background: "#0a0a0b",
    primaryColor: "#22d3ee",
    primaryTextColor: "#e4e4e7",
    primaryBorderColor: "#22d3ee",
    lineColor: "#52525b",
    secondaryColor: "#18181b",
    tertiaryColor: "#27272a",
  },
});

let renderCount = 0;

export default function MermaidDiagram({ code }) {
  const containerRef = useRef(null);
  const [svg, setSvg] = useState("");
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const id = `mermaid-${++renderCount}`;

    mermaid
      .render(id, code)
      .then(({ svg: rendered }) => {
        if (!cancelled) {
          setSvg(rendered);
          setError(null);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err.message || "Failed to render diagram");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [code]);

  if (error) {
    return (
      <div className="my-3 bg-elevated border border-line rounded-lg p-3">
        <p className="text-[10px] font-mono text-fg-muted mb-1">mermaid (render error)</p>
        <pre className="text-fg-muted text-xs font-mono whitespace-pre-wrap">{code}</pre>
        <p className="text-[10px] text-accent mt-1">{error}</p>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="my-3 bg-elevated border border-line rounded-lg p-4 flex justify-center overflow-x-auto"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
