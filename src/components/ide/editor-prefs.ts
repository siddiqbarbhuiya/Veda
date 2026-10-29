"use client";

import { useSyncExternalStore } from "react";

/** Editor view settings that the View menu changes. They are saved in this browser. */
export type EditorPrefs = { wordWrap: boolean; minimap: boolean; fontSize: number };

export const DEFAULT_PREFS: EditorPrefs = { wordWrap: false, minimap: false, fontSize: 14 };
export const MIN_FONT = 10;
export const MAX_FONT = 28;
const KEY = "veda-editor-prefs";

export function clampFont(size: number): number {
  if (!Number.isFinite(size)) return DEFAULT_PREFS.fontSize;
  return Math.min(MAX_FONT, Math.max(MIN_FONT, Math.round(size)));
}

/** Read saved text. A bad or partial value falls back to the default for each field. */
export function parsePrefs(text: string | null): EditorPrefs {
  if (!text) return DEFAULT_PREFS;
  try {
    const v = JSON.parse(text) as Partial<Record<keyof EditorPrefs, unknown>>;
    return {
      wordWrap: typeof v.wordWrap === "boolean" ? v.wordWrap : DEFAULT_PREFS.wordWrap,
      minimap: typeof v.minimap === "boolean" ? v.minimap : DEFAULT_PREFS.minimap,
      fontSize: typeof v.fontSize === "number" ? clampFont(v.fontSize) : DEFAULT_PREFS.fontSize,
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

let current: EditorPrefs | null = null;
const subscribers = new Set<() => void>();

function load(): EditorPrefs {
  if (current) return current;
  let text: string | null = null;
  try {
    text = localStorage.getItem(KEY);
  } catch {
    /* storage is blocked */
  }
  current = parsePrefs(text);
  return current;
}

export function getEditorPrefs(): EditorPrefs {
  return load();
}

export function setEditorPrefs(change: Partial<EditorPrefs>): void {
  const next: EditorPrefs = { ...load(), ...change };
  next.fontSize = clampFont(next.fontSize);
  current = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* storage is blocked */
  }
  subscribers.forEach((cb) => cb());
}

export function useEditorPrefs(): EditorPrefs {
  return useSyncExternalStore(
    (cb) => {
      subscribers.add(cb);
      return () => {
        subscribers.delete(cb);
      };
    },
    getEditorPrefs,
    () => DEFAULT_PREFS
  );
}
