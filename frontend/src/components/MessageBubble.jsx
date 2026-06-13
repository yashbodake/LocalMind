import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { PrismLight as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import python from "react-syntax-highlighter/dist/esm/languages/prism/python";
import javascript from "react-syntax-highlighter/dist/esm/languages/prism/javascript";
import bash from "react-syntax-highlighter/dist/esm/languages/prism/bash";
import json from "react-syntax-highlighter/dist/esm/languages/prism/json";
import yaml from "react-syntax-highlighter/dist/esm/languages/prism/yaml";
import markdown from "react-syntax-highlighter/dist/esm/languages/prism/markdown";
import sql from "react-syntax-highlighter/dist/esm/languages/prism/sql";
import typescript from "react-syntax-highlighter/dist/esm/languages/prism/typescript";

SyntaxHighlighter.registerLanguage("python", python);
SyntaxHighlighter.registerLanguage("javascript", javascript);
SyntaxHighlighter.registerLanguage("bash", bash);
SyntaxHighlighter.registerLanguage("json", json);
SyntaxHighlighter.registerLanguage("yaml", yaml);
SyntaxHighlighter.registerLanguage("markdown", markdown);
SyntaxHighlighter.registerLanguage("sql", sql);
SyntaxHighlighter.registerLanguage("typescript", typescript);
import SourceGrid from "./SourceGrid";
import MessageActions from "./MessageActions";
import CitationBadge from "./CitationBadge";
import FollowUpSuggestions from "./FollowUpSuggestions";

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
  followups,
  onFollowUp,
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
              return match ? (
                <div className="relative group my-3">
                  <span className="absolute top-2 right-3 text-[10px] font-mono text-fg-muted z-10">
                    {lang}
                  </span>
                  <SyntaxHighlighter
                    language={lang}
                    style={oneDark}
                    customStyle={{
                      background: "var(--color-elevated)",
                      border: "1px solid var(--color-border)",
                      borderRadius: "8px",
                      fontSize: "12px",
                      margin: 0,
                    }}
                  >
                    {String(children).replace(/\n$/, "")}
                  </SyntaxHighlighter>
                </div>
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
        <MessageActions content={content} latencyMs={latencyMs} onRetry={onRetry} />
      )}
    </div>
  );
}
