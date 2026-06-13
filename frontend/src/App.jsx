import { useState, useEffect, useCallback } from "react";
import Sidebar from "./components/Sidebar";
import ChatWindow from "./components/ChatWindow";
import { getSources, getSessions, createSession } from "./hooks/useChat";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";

export default function App() {
  const [sessions, setSessions] = useState([]);
  const [currentSessionId, setCurrentSessionId] = useState(null);
  const [selectedModel, setSelectedModel] = useState(null);
  const [selectedDocIds, setSelectedDocIds] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

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
        if (selectedDocIds === null) {
          const ids = (data.sources || []).map((s) => s.doc_id);
          setSelectedDocIds(ids);
        }
      })
      .catch(() => setSelectedDocIds([]));
  }, []);

  useEffect(() => {
    getSessions()
      .then((data) => {
        const list = data.sessions || [];
        setSessions(list);
        if (list.length > 0) {
          setCurrentSessionId(list[0].id);
        } else {
          createSession()
            .then((s) => {
              setSessions([{ ...s, message_count: 0 }]);
              setCurrentSessionId(s.id);
            })
            .catch(() => {});
        }
      })
      .catch(() => {
        createSession()
          .then((s) => {
            setSessions([{ ...s, message_count: 0 }]);
            setCurrentSessionId(s.id);
          })
          .catch(() => {});
      });
  }, []);

  const newChat = useCallback(async () => {
    try {
      const s = await createSession({ model: selectedModel, doc_ids: selectedDocIds });
      setSessions((prev) => [{ ...s, message_count: 0 }, ...prev]);
      setCurrentSessionId(s.id);
    } catch {}
  }, [selectedModel, selectedDocIds]);

  useKeyboardShortcuts({
    onNewChat: newChat,
    onFocusInput: null,
    onStop: null,
    streaming: false,
  });

  const switchSession = useCallback((id) => {
    setCurrentSessionId(id);
  }, []);

  const handleSessionUpdate = useCallback((id, updates) => {
    setSessions((prev) =>
      prev.map((s) => (s.id === id ? { ...s, ...updates } : s))
    );
  }, []);

  const handleSessionDelete = useCallback((id) => {
    const remaining = sessions.filter((s) => s.id !== id);
    setSessions(remaining);
    if (id === currentSessionId) {
      if (remaining.length > 0) {
        setCurrentSessionId(remaining[0].id);
      } else {
        createSession()
          .then((s) => {
            setSessions([{ ...s, message_count: 0 }]);
            setCurrentSessionId(s.id);
          })
          .catch(() => {});
      }
    }
  }, [currentSessionId, sessions]);

  return (
    <div className="flex h-screen bg-base overflow-hidden">
      <Sidebar
        sessions={sessions}
        currentSessionId={currentSessionId}
        onSwitchSession={switchSession}
        onSessionUpdate={handleSessionUpdate}
        onSessionDelete={handleSessionDelete}
        onNewChat={newChat}
        selectedDocIds={selectedDocIds}
        onSelectDocIds={setSelectedDocIds}
        sidebarOpen={sidebarOpen}
        onCloseSidebar={() => setSidebarOpen(false)}
        theme={theme}
        onToggleTheme={toggleTheme}
      />
      <main className="flex-1 min-w-0">
        {currentSessionId ? (
          <ChatWindow
            key={currentSessionId}
            sessionId={currentSessionId}
            selectedModel={selectedModel}
            onSelectModel={setSelectedModel}
            selectedDocIds={selectedDocIds}
            onOpenSidebar={() => setSidebarOpen(true)}
            onSessionLoaded={(session) => {
              if (session.model) setSelectedModel(session.model);
              if (session.doc_ids) setSelectedDocIds(session.doc_ids);
            }}
            onMessageSaved={(autoTitle) => {
              if (autoTitle) {
                handleSessionUpdate(currentSessionId, { title: autoTitle });
              }
            }}
          />
        ) : (
          <div className="flex items-center justify-center h-full">
            <p className="text-fg-muted text-sm">Loading…</p>
          </div>
        )}
      </main>
    </div>
  );
}
