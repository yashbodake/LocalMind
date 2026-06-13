import { useEffect, useRef } from "react";

export function useKeyboardShortcuts({ onNewChat, onFocusInput, onStop, streaming }) {
  const handlersRef = useRef({ onNewChat, onFocusInput, onStop, streaming });
  handlersRef.current = { onNewChat, onFocusInput, onStop, streaming };

  useEffect(() => {
    const handler = (e) => {
      const mod = e.metaKey || e.ctrlKey;

      if (mod && e.key === "k") {
        e.preventDefault();
        handlersRef.current.onNewChat?.();
      }

      if (mod && e.key === "l") {
        e.preventDefault();
        handlersRef.current.onFocusInput?.();
      }

      if (e.key === "Escape" && handlersRef.current.streaming) {
        e.preventDefault();
        handlersRef.current.onStop?.();
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);
}
