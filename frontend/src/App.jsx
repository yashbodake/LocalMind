import { useState, useEffect } from "react";
import Sidebar from "./components/Sidebar";
import ChatWindow from "./components/ChatWindow";
import { getSources } from "./hooks/useChat";

export default function App() {
  const [selectedModel, setSelectedModel] = useState(null);
  const [selectedDocIds, setSelectedDocIds] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [chatKey, setChatKey] = useState(0);

  const newChat = () => setChatKey((k) => k + 1);

  const [theme, setTheme] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("localmind-theme") || "dark";
    }
    return "dark";
  });

  useEffect(() => {
    if (theme === "light") {
      document.documentElement.classList.add("light");
    } else {
      document.documentElement.classList.remove("light");
    }
    localStorage.setItem("localmind-theme", theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === "dark" ? "light" : "dark"));
  };

  useEffect(() => {
    getSources()
      .then((data) => {
        const ids = (data.sources || []).map((s) => s.doc_id);
        setSelectedDocIds(ids);
      })
      .catch(() => setSelectedDocIds([]));
  }, []);

  return (
    <div className="flex h-screen bg-base overflow-hidden">
      <Sidebar
        selectedDocIds={selectedDocIds}
        onSelectDocIds={setSelectedDocIds}
        sidebarOpen={sidebarOpen}
        onCloseSidebar={() => setSidebarOpen(false)}
        theme={theme}
        onToggleTheme={toggleTheme}
        onNewChat={newChat}
      />
      <main className="flex-1 min-w-0">
        <ChatWindow
          key={chatKey}
          selectedModel={selectedModel}
          onSelectModel={setSelectedModel}
          selectedDocIds={selectedDocIds}
          onOpenSidebar={() => setSidebarOpen(true)}
        />
      </main>
    </div>
  );
}
