import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { Pencil, X } from "lucide-react";
import SourceGrid from "./SourceGrid";
import MessageActions from "./MessageActions";
import CitationBadge from "./CitationBadge";
import FollowUpSuggestions from "./FollowUpSuggestions";
import CodeBlock from "./CodeBlock";
import MermaidDiagram from "./MermaidDiagram";

const CITATION_RE = /\[(\d+)\]/g;

function renderParagraphChildren(children, sources) {
  const result = [];
  let key = 0;
  const walk = (node) => {
    if (typeof node === "string") {
      const parts = node.split(CITATION_RE);
      for (let i = 0; i < parts.length; i++) {
        if (i % 2 === 0) {
          if (parts[i]) result.push(<span key={key++}>{parts[i]}</span>);
        } else {
          result.push(<CitationBadge key={key++} index={parseInt(parts[i], 10)} sources={sources} />);
        }
      }
    } else if (Array.isArray(node)) {
      node.forEach(walk);
    } else {
      result.push(<span key={key++}>{node}</span>);
    }
  };
  walk(children);
  return result;
}

export default function MessageBubble({
  role,
  content,
  sources = [],
  latencyMs,
  onRetry,
  onRetryWithModel,
  models,
  feedback,
  onFeedback,
  followups,
  onFollowUp,
  onEdit,
  messageIndex,
  streaming,
}) {
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(content);
  const isUser = role === "user";

  const handleEditSubmit = () => {
    const trimmed = editText.trim();
    if (!trimmed || trimmed === content) {
      setEditing(false);
      return;
    }
    onEdit?.(messageIndex, trimmed);
    setEditing(false);
  };

  const handleEditCancel = () => {
    setEditText(content);
    setEditing(false);
  };

  if (isUser) {
    if (editing) {
      return (
        <div className="flex flex-col items-end mb-7 gap-2">
          <div className="w-full max-w-[75%]">
            <div className="font-mono text-[10px] font-semibold uppercase tracking-wider text-fg-muted mb-1.5">
              &gt; editing query
            </div>
            <textarea
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleEditSubmit(); }
                if (e.key === "Escape") handleEditCancel();
              }}
              autoFocus
              rows={2}
              className="w-full bg-surface border border-accent/30 rounded-lg p-3 text-fg text-lg font-normal leading-snug outline-none resize-none"
              aria-label="Edit your question"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleEditCancel}
              className="flex items-center gap-1 px-2.5 py-1 border border-line rounded-md text-fg-muted hover:text-fg text-xs transition-colors"
            >
              <X size={12} aria-hidden="true" /> Cancel
            </button>
            <button
              onClick={handleEditSubmit}
              className="flex items-center gap-1 px-2.5 py-1 border border-accent/30 bg-accent/10 rounded-md text-accent text-xs transition-colors"
            >
              Submit &amp; Regenerate
            </button>
          </div>
        </div>
      );
    }

    return (
      <div className="group flex justify-end mb-7">
        <div className="max-w-[75%]">
          <div className="flex items-center gap-2 mb-1.5">
            {onEdit && !streaming && (
              <button
                onClick={() => setEditing(true)}
                className="opacity-0 group-hover:opacity-100 text-fg-muted hover:text-accent transition-opacity"
                aria-label="Edit question"
              >
                <Pencil size={11} aria-hidden="true" />
              </button>
            )}
            <div className="font-mono text-[10px] font-semibold uppercase tracking-wider text-fg-muted">
              &gt; query
            </div>
          </div>
          <div className="text-fg text-lg font-normal leading-snug">
            {content}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mb-7">
      <div className="font-mono text-[10px] font-semibold uppercase tracking-wider text-accent mb-2.5">
        &gt; response
      </div>
      <div className="text-fg-secondary leading-[1.8] text-[14.5px] font-sans prose-invert max-w-none">
        <ReactMarkdown
          remarkPlugins={[remarkGfm, remarkMath]}
          rehypePlugins={[rehypeKatex]}
          components={{
            p: ({ children }) => <p className="mb-3">{renderParagraphChildren(children, sources)}</p>,
            strong: ({ children }) => (
              <strong className="text-fg font-semibold">{children}</strong>
            ),
            ul: ({ children }) => (
              <ul className="mb-3 ml-5 list-disc marker:text-fg-muted">{children}</ul>
            ),
            ol: ({ children }) => (
              <ol className="mb-3 ml-5 list-decimal marker:text-fg-muted">{children}</ol>
            ),
            li: ({ children }) => <li className="mb-1.5 text-fg-secondary">{children}</li>,
            code: ({ className, children }) => {
              const match = /language-([\w+#.-]+)/.exec(className || "");
              const lang = match ? match[1] : "text";
              const rawCode = String(children).replace(/\n$/, "");
              if (lang === "mermaid") {
                return <MermaidDiagram code={rawCode} />;
              }
              return match ? (
                <CodeBlock lang={lang} code={rawCode} />
              ) : (
                <code className="font-mono bg-elevated text-accent px-1.5 py-0.5 rounded text-[12px] border border-line">
                  {children}
                </code>
              );
            },
            pre: ({ children }) => <>{children}</>,
            a: ({ href, children }) => (
              <a href={href} className="text-accent underline hover:text-accent/80" target="_blank" rel="noopener noreferrer">
                {children}
              </a>
            ),
            blockquote: ({ children }) => (
              <blockquote className="border-l-2 border-accent/40 pl-3 text-fg-muted italic my-3">
                {children}
              </blockquote>
            ),
            table: ({ children }) => (
              <div className="overflow-x-auto my-3">
                <table className="w-full border-collapse text-xs">{children}</table>
              </div>
            ),
            thead: ({ children }) => <thead className="border-b border-line">{children}</thead>,
            th: ({ children }) => (
              <th className="text-left font-mono font-semibold text-fg-secondary px-3 py-2 border-b border-line">
                {children}
              </th>
            ),
            td: ({ children }) => (
              <td className="px-3 py-2 border-b border-line text-fg-secondary">{children}</td>
            ),
          }}
        >
          {content}
        </ReactMarkdown>
      </div>
        {followups && followups.length > 0 && (
          <FollowUpSuggestions suggestions={followups} onSelect={onFollowUp} />
        )}
      {sources.length > 0 && <SourceGrid sources={sources} />}
      {(content || sources.length > 0) && (
        <MessageActions
          content={content}
          latencyMs={latencyMs}
          onRetry={onRetry}
          onRetryWithModel={onRetryWithModel}
          models={models}
          feedback={feedback}
          onFeedback={onFeedback}
        />
      )}
    </div>
  );
}
