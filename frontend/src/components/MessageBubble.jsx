import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import SourceGrid from "./SourceGrid";
import MessageActions from "./MessageActions";

export default function MessageBubble({
  role,
  content,
  sources = [],
  latencyMs,
  onRetry,
}) {
  const isUser = role === "user";

  if (isUser) {
    return (
      <div className="flex justify-end mb-7">
        <div className="max-w-[75%]">
          <div className="font-mono text-[10px] font-semibold uppercase tracking-wider text-fg-muted mb-1.5">
            &gt; query
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
          remarkPlugins={[remarkGfm]}
          components={{
            p: ({ children }) => <p className="mb-3">{children}</p>,
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
            code: ({ inline, children }) =>
              inline ? (
                <code className="font-mono bg-elevated text-accent px-1.5 py-0.5 rounded text-[12px] border border-line">
                  {children}
                </code>
              ) : (
                <pre className="bg-elevated border border-line rounded-lg p-3 overflow-x-auto my-3">
                  <code className="font-mono text-[12px] text-accent">{children}</code>
                </pre>
              ),
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
            sup: ({ children }) => (
              <sup className="font-mono text-accent text-[9px] font-semibold border border-accent/25 px-1 py-px rounded ml-0.5 cursor-pointer hover:bg-accent/10 align-super">
                {children}
              </sup>
            ),
          }}
        >
          {content}
        </ReactMarkdown>
      </div>
      {sources.length > 0 && <SourceGrid sources={sources} />}
      {(content || sources.length > 0) && (
        <MessageActions content={content} latencyMs={latencyMs} onRetry={onRetry} />
      )}
    </div>
  );
}
