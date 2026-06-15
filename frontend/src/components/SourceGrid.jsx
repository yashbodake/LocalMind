import { useState, useMemo } from "react";
import SourceCard from "./SourceCard";
import SourceGroup from "./SourceGroup";
import DocumentPreview from "./DocumentPreview";

export default function SourceGrid({ sources }) {
  const [previewDoc, setPreviewDoc] = useState(null);

  const groups = useMemo(() => {
    const map = new Map();
    sources.forEach((s, i) => {
      if (!map.has(s.doc_id)) {
        map.set(s.doc_id, { filename: s.filename, chunks: [], globalIndices: [] });
      }
      const group = map.get(s.doc_id);
      group.chunks.push(s);
      group.globalIndices.push(i);
    });
    const groupArray = Array.from(map.values());
    groupArray.forEach((g) => {
      g.bestScore = Math.max(...g.chunks.map((c) => c.score || 0));
      g.chunks.sort((a, b) => a.chunk_index - b.chunk_index);
    });
    groupArray.sort((a, b) => b.bestScore - a.bestScore);
    return groupArray;
  }, [sources]);

  const needsGrouping = groups.some((g) => g.chunks.length > 1);

  const handleViewDocument = (docId, filename) => {
    setPreviewDoc({ docId, filename });
  };

  if (!sources || sources.length === 0) return null;

  return (
    <>
      <div className="mt-4">
        <div className="font-mono text-[9px] font-semibold uppercase tracking-wider text-fg-muted mb-2.5">
          // retrieved sources
        </div>
        {needsGrouping ? (
          <div className="flex flex-col gap-2">
            {groups.map((group, gi) => (
              <SourceGroup
                key={group.globalIndices[0]}
                filename={group.filename}
                chunks={group.chunks}
                globalIndices={group.globalIndices}
                defaultOpen={gi === 0}
                onViewDocument={handleViewDocument}
              />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {sources.map((s, i) => (
              <SourceCard
                key={i}
                index={i + 1}
                {...s}
                onViewDocument={handleViewDocument}
              />
            ))}
          </div>
        )}
      </div>
      {previewDoc && (
        <DocumentPreview
          docId={previewDoc.docId}
          filename={previewDoc.filename}
          onClose={() => setPreviewDoc(null)}
        />
      )}
    </>
  );
}
