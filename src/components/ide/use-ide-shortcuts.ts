"use client";

import { useEffect, useRef } from "react";

export type ShortcutId =
  | "palette"
  | "paletteAlt"
  | "run"
  | "save"
  | "sidebar"
  | "terminal"
  | "chat"
  | "newFile"
  | "shortcuts";

/** "Mod" is Ctrl on Windows/Linux and Cmd on macOS. "Alt" is Option on macOS. */
export const SHORTCUTS: { id: ShortcutId; keys: string[]; label: string }[] = [
  { id: "palette", keys: ["Mod", "K"], label: "Command palette" },
  { id: "paletteAlt", keys: ["Mod", "Shift", "P"], label: "Command palette (alternative)" },
  { id: "run", keys: ["Mod", "Enter"], label: "Run code" },
  { id: "save", keys: ["Mod", "S"], label: "Save" },
  { id: "sidebar", keys: ["Mod", "B"], label: "Toggle sidebar" },
  { id: "terminal", keys: ["Mod", "J"], label: "Toggle terminal" },
  { id: "chat", keys: ["Mod", "Shift", "L"], label: "Toggle and focus chat" },
  { id: "newFile", keys: ["Alt", "N"], label: "New file" },
  { id: "shortcuts", keys: ["?"], label: "Keyboard shortcuts" },
];

export function isMac(): boolean {
  if (typeof navigator === "undefined") return false;
  const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
  const platform = nav.userAgentData?.platform || nav.platform || "";
  return /mac|iphone|ipad|ipod/i.test(platform);
}

/** Key names to show for the current platform, for example ["Cmd", "Option", "N"]. */
export function displayKeys(keys: string[], mac: boolean = isMac()): string[] {
  return keys.map((k) => (k === "Mod" ? (mac ? "Cmd" : "Ctrl") : k === "Alt" && mac ? "Option" : k));
}

export function shortcutKeys(id: ShortcutId, mac: boolean = isMac()): string[] {
  const s = SHORTCUTS.find((x) => x.id === id);
  return s ? displayKeys(s.keys, mac) : [];
}

/** Text for a title attribute, for example "Ctrl+Enter". */
export function shortcutLabel(id: ShortcutId, mac: boolean = isMac()): string {
  return shortcutKeys(id, mac).join("+");
}

export type KeyLike = {
  key?: string;
  code?: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  repeat?: boolean;
  isComposing?: boolean;
};

export type ShortcutContext = {
  /** The event target is inside the xterm terminal. */
  inXterm: boolean;
  /** The event target accepts text (input, textarea, contenteditable). */
  editable: boolean;
  /** A dialog other than the command palette is open. */
  otherDialogOpen: boolean;
  /** The command palette is open. */
  paletteOpen: boolean;
};

/** Latin letter for the event. Uses `code` when `key` is not a Latin letter (macOS Option, Indic layouts). */
function letterOf(e: KeyLike): string {
  const key = e.key?.toLowerCase() ?? "";
  if (/^[a-z]$/.test(key)) return key;
  const code = e.code ?? "";
  return /^Key[A-Z]$/.test(code) ? code.slice(3).toLowerCase() : "";
}

/** Pure matcher. Returns the shortcut for a keydown event, or null. */
export function matchShortcut(e: KeyLike, ctx: ShortcutContext): ShortcutId | null {
  if (e.repeat || e.isComposing) return null;
  if (ctx.otherDialogOpen) return null;
  const mod = e.ctrlKey || e.metaKey;
  const letter = letterOf(e);
  const enter = (e.key ?? "") === "Enter";
  let id: ShortcutId | null = null;

  if (mod && !e.altKey) {
    if (!e.shiftKey) {
      if (letter === "k") id = "palette";
      else if (enter) id = "run";
      else if (letter === "s") id = "save";
      else if (letter === "b") id = "sidebar";
      else if (letter === "j") id = "terminal";
    } else if (letter === "p") id = "paletteAlt";
    else if (letter === "l") id = "chat";
    // The shell keeps its readline keys: Ctrl+K, Ctrl+B and Ctrl+J are not stolen inside xterm.
    if (ctx.inXterm && e.ctrlKey && !e.metaKey && (id === "palette" || id === "sidebar" || id === "terminal")) {
      return null;
    }
  } else if (!mod) {
    if (e.altKey && !e.shiftKey && letter === "n") id = "newFile";
    else if (!e.altKey && !ctx.editable && e.key === "?") id = "shortcuts";
  }

  if (!id) return null;
  // While the palette is open, only its own toggle works.
  if (ctx.paletteOpen && id !== "palette" && id !== "paletteAlt") return null;
  return id;
}

export type ShortcutHandlers = {
  palette: () => void;
  run: () => void;
  save: () => void;
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

function dialogState(): { otherDialogOpen: boolean; paletteOpen: boolean } {
  let otherDialogOpen = false;
  let paletteOpen = false;
  document.querySelectorAll("dialog[open]").forEach((d) => {
    if (d.getAttribute("aria-label") === "Command palette") paletteOpen = true;
    else otherDialogOpen = true;
  });
  return { otherDialogOpen, paletteOpen };
}

/**
 * Window-level key handlers. Ctrl/Cmd and Alt combos work everywhere, also in the Monaco and xterm
 * helper textareas (they are not typing). Only the bare `?` key is ignored while the user types.
 */
export function useIdeShortcuts(handlers: ShortcutHandlers, enabled = true) {
  const ref = useRef(handlers);
  useEffect(() => {
    ref.current = handlers;
  });

  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target instanceof Element ? e.target : null;
      const id = matchShortcut(e, {
        inXterm: !!target?.closest(".xterm"),
        editable: isEditable(e.target),
        ...dialogState(),
      });
      if (!id) return;
      const h = ref.current;
      const fn =
        id === "palette" || id === "paletteAlt"
          ? h.palette
          : id === "run"
            ? h.run
            : id === "save"
              ? h.save
              : id === "sidebar"
                ? h.toggleSidebar
                : id === "terminal"
                  ? h.toggleTerminal
                  : id === "chat"
                    ? h.chat
                    : id === "newFile"
                      ? h.newFile
                      : h.shortcuts;
      e.preventDefault();
      e.stopPropagation();
      fn();
    };
    // Capture phase so Monaco does not consume Ctrl+Enter or the Ctrl+K chord first.
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [enabled]);
}
