import { useState, useEffect } from "react";
import Sidebar from "./components/Sidebar";
import ChatWindow from "./components/ChatWindow";
import { getSources } from "./hooks/useChat";

export default function App() {
  const [selectedModel, setSelectedModel] = useState(null);
  const [selectedDocIds, setSelectedDocIds] = useState(null);

  useEffect(() => {
    getSources()
      .then((data) => {
        const ids = (data.sources || []).map((s) => s.doc_id);
        setSelectedDocIds(ids);
      })
      .catch(() => setSelectedDocIds([]));
  }, []);

  return (
    <div className="flex h-screen bg-white">
      <Sidebar
        selectedDocIds={selectedDocIds}
        onSelectDocIds={setSelectedDocIds}
      />
      <main className="flex-1 min-w-0">
        <ChatWindow
          selectedModel={selectedModel}
          onSelectModel={setSelectedModel}
          selectedDocIds={selectedDocIds}
        />
      </main>
    </div>
  );
}
