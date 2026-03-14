import { useEffect } from "react";

interface UseKeyboardShortcutsOptions {
  insights: Array<{ id: string }>;
  focusedIndex: number;
  setFocusedIndex: (idx: number) => void;
  onApprove: (id: string) => void;
  onDiscard: (id: string) => void;
  onFlag: (id: string) => void;
  onToggleExpand: (id: string) => void;
  onShowHelp: () => void;
  expandedIds: Set<string>;
}

export function useKeyboardShortcuts({
  insights,
  focusedIndex,
  setFocusedIndex,
  onApprove,
  onDiscard,
  onFlag,
  onToggleExpand,
  onShowHelp,
  expandedIds,
}: UseKeyboardShortcutsOptions) {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Skip when typing in an input or textarea
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      ) {
        return;
      }

      const current = insights[focusedIndex];

      switch (e.key) {
        case "j":
          e.preventDefault();
          setFocusedIndex(Math.min(focusedIndex + 1, insights.length - 1));
          break;
        case "k":
          e.preventDefault();
          setFocusedIndex(Math.max(focusedIndex - 1, 0));
          break;
        case "a":
          e.preventDefault();
          if (current) onApprove(current.id);
          break;
        case "d":
          e.preventDefault();
          if (current) onDiscard(current.id);
          break;
        case "f":
          e.preventDefault();
          if (current) onFlag(current.id);
          break;
        case "e":
        case " ":
          e.preventDefault();
          if (current) onToggleExpand(current.id);
          break;
        case "?":
          e.preventDefault();
          onShowHelp();
          break;
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [insights, focusedIndex, setFocusedIndex, onApprove, onDiscard, onFlag, onToggleExpand, onShowHelp, expandedIds]);
}
