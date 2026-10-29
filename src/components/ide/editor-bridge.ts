"use client";

import type { editor } from "monaco-editor";

/**
 * The menu bar needs to run commands in the open Monaco editor (undo, find, go to line, and so on).
 * The editor panel registers its editor here. The menu bar calls `runEditorAction`.
 */

type Editor = editor.IStandaloneCodeEditor;

let current: Editor | null = null;

export function registerEditor(ed: Editor | null): void {
  current = ed;
}

export function hasEditor(): boolean {
  return current !== null;
}

/** Run a Monaco action by id (for example "actions.find"). Returns false when no editor is open. */
export function runEditorAction(id: string): boolean {
  const ed = current;
  if (!ed) return false;
  ed.focus();
  const action = ed.getAction(id);
  if (action) {
    void action.run();
  } else {
    // Commands such as "undo" and "redo" are handlers, not actions.
    ed.trigger("menu", id, null);
  }
  return true;
}

/** Paste the text from the clipboard. The browser may ask for permission. */
export async function pasteFromClipboard(): Promise<boolean> {
  const ed = current;
  if (!ed) return false;
  ed.focus();
  try {
    const text = await navigator.clipboard.readText();
    ed.trigger("menu", "paste", { text });
    return true;
  } catch {
    // No permission: use the normal paste action, which may work in this browser.
    return runEditorAction("editor.action.clipboardPasteAction");
  }
}
