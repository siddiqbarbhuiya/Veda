"use client";

import { useEffect, useRef } from "react";

export type ShortcutHandlers = {
  palette: () => void;
  run: () => void;
  toggleSidebar: () => void;
  toggleTerminal: () => void;
  chat: () => void;
  newFile: () => void;
  shortcuts: () => void;
};

function isEditable(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  return t.isContentEditable || t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT";
}

/**
 * Window-level key handlers. Ctrl/Cmd combos work everywhere (also inside Monaco).
 * Plain keys (Alt+N, ?) are ignored while the user types. Ctrl+S is never handled here.
 */
export function useIdeShortcuts(handlers: ShortcutHandlers, enabled = true) {
  const ref = useRef(handlers);
  useEffect(() => {
    ref.current = handlers;
  });

  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      const h = ref.current;
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();
      let fn: (() => void) | null = null;

      if (mod && !e.altKey) {
        if (!e.shiftKey && key === "k") fn = h.palette;
        else if (e.shiftKey && key === "p") fn = h.palette;
        else if (!e.shiftKey && key === "enter") fn = h.run;
        else if (!e.shiftKey && key === "b") fn = h.toggleSidebar;
        else if (!e.shiftKey && key === "j") fn = h.toggleTerminal;
        else if (e.shiftKey && key === "l") fn = h.chat;
      } else if (!mod && !isEditable(e.target)) {
        if (e.altKey && !e.shiftKey && key === "n") fn = h.newFile;
        else if (!e.altKey && e.key === "?") fn = h.shortcuts;
      }

      if (!fn) return;
      e.preventDefault();
      e.stopPropagation();
      fn();
    };
    // Capture phase so Monaco does not consume Ctrl+Enter or the Ctrl+K chord first.
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [enabled]);
}
