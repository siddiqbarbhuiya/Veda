import type { EditorPrefs } from "./editor-prefs";
import { MAX_FONT, MIN_FONT } from "./editor-prefs";

/** The menu bar (File, Edit, Selection, View, Go, Run, Terminal, Help) as data. The component only draws it. */

export type MenuItem =
  | { type: "separator" }
  | {
      type: "item";
      id: string;
      label: string;
      /** Shortcut keys. "Mod" is Ctrl or Cmd. */
      keys?: string[];
      run: () => void;
      disabled?: boolean;
      /** Set for a toggle. The menu shows a check mark. */
      checked?: boolean;
    };

export type Menu = { id: string; label: string; items: MenuItem[] };

export type MenuActions = {
  // Shell
  newFile: () => void;
  newFolder: () => void;
  newFromTemplate: () => void;
  openProjects: () => void;
  save: () => void;
  exportZip: () => void;
  goDashboard: () => void;
  signOut: () => void;
  palette: () => void;
  toggleSidebar: () => void;
  toggleTerminal: () => void;
  toggleChat: () => void;
  toggleTheme: () => void;
  showShortcuts: () => void;
  run: () => void;
  stop: () => void;
  addPackage: () => void;
  focusTerminal: () => void;
  clearTerminal: () => void;
  // Editor
  editor: (actionId: string) => void;
  paste: () => void;
  setPrefs: (change: Partial<EditorPrefs>) => void;
};

export type MenuContext = {
  /** A file is open in the editor. */
  hasFile: boolean;
  /** The runtime is booting or running. */
  busy: boolean;
  prefs: EditorPrefs;
};

const sep: MenuItem = { type: "separator" };

export function buildMenus(a: MenuActions, ctx: MenuContext): Menu[] {
  const item = (id: string, label: string, run: () => void, extra: Partial<Extract<MenuItem, { type: "item" }>> = {}): MenuItem => ({
    type: "item",
    id,
    label,
    run,
    ...extra,
  });
  /** An item that runs a Monaco action. It needs an open file. */
  const ed = (id: string, label: string, actionId: string, keys?: string[]): MenuItem =>
    item(id, label, () => a.editor(actionId), { keys, disabled: !ctx.hasFile });

  return [
    {
      id: "file",
      label: "File",
      items: [
        item("new-file", "New File", a.newFile, { keys: ["Alt", "N"] }),
        item("new-folder", "New Folder", a.newFolder),
        item("new-from-template", "New Project from Template...", a.newFromTemplate),
        sep,
        item("projects", "Switch or Create Project...", a.openProjects),
        sep,
        item("save", "Save", a.save, { keys: ["Mod", "S"] }),
        item("export", "Export Project as ZIP...", a.exportZip),
        sep,
        item("dashboard", "Go to Dashboard", a.goDashboard),
        item("sign-out", "Sign Out", a.signOut),
      ],
    },
    {
      id: "edit",
      label: "Edit",
      items: [
        ed("undo", "Undo", "undo", ["Mod", "Z"]),
        ed("redo", "Redo", "redo", ["Mod", "Shift", "Z"]),
        sep,
        ed("cut", "Cut", "editor.action.clipboardCutAction", ["Mod", "X"]),
        ed("copy", "Copy", "editor.action.clipboardCopyAction", ["Mod", "C"]),
        item("paste", "Paste", a.paste, { keys: ["Mod", "V"], disabled: !ctx.hasFile }),
        sep,
        ed("find", "Find", "actions.find", ["Mod", "F"]),
        ed("replace", "Replace", "editor.action.startFindReplace", ["Mod", "H"]),
        sep,
        ed("line-comment", "Toggle Line Comment", "editor.action.commentLine", ["Mod", "/"]),
        ed("block-comment", "Toggle Block Comment", "editor.action.blockComment", ["Shift", "Alt", "A"]),
        sep,
        ed("format", "Format Document", "editor.action.formatDocument", ["Shift", "Alt", "F"]),
      ],
    },
    {
      id: "selection",
      label: "Selection",
      items: [
        ed("select-all", "Select All", "editor.action.selectAll", ["Mod", "A"]),
        ed("expand", "Expand Selection", "editor.action.smartSelect.expand", ["Shift", "Alt", "Right"]),
        ed("shrink", "Shrink Selection", "editor.action.smartSelect.shrink", ["Shift", "Alt", "Left"]),
        sep,
        ed("copy-up", "Copy Line Up", "editor.action.copyLinesUpAction", ["Shift", "Alt", "Up"]),
        ed("copy-down", "Copy Line Down", "editor.action.copyLinesDownAction", ["Shift", "Alt", "Down"]),
        ed("move-up", "Move Line Up", "editor.action.moveLinesUpAction", ["Alt", "Up"]),
        ed("move-down", "Move Line Down", "editor.action.moveLinesDownAction", ["Alt", "Down"]),
        sep,
        ed("cursor-above", "Add Cursor Above", "editor.action.insertCursorAbove", ["Mod", "Alt", "Up"]),
        ed("cursor-below", "Add Cursor Below", "editor.action.insertCursorBelow", ["Mod", "Alt", "Down"]),
        ed("occurrences", "Select All Occurrences of Find Match", "editor.action.selectHighlights"),
      ],
    },
    {
      id: "view",
      label: "View",
      items: [
        item("palette", "Command Palette...", a.palette, { keys: ["Mod", "K"] }),
        sep,
        item("sidebar", "Explorer", a.toggleSidebar, { keys: ["Mod", "B"] }),
        item("terminal", "Terminal", a.toggleTerminal, { keys: ["Mod", "J"] }),
        item("chat", "AI Chat", a.toggleChat, { keys: ["Mod", "Shift", "L"] }),
        sep,
        item("word-wrap", "Word Wrap", () => a.setPrefs({ wordWrap: !ctx.prefs.wordWrap }), { checked: ctx.prefs.wordWrap }),
        item("minimap", "Minimap", () => a.setPrefs({ minimap: !ctx.prefs.minimap }), { checked: ctx.prefs.minimap }),
        item("zoom-in", "Zoom In (Editor Text)", () => a.setPrefs({ fontSize: ctx.prefs.fontSize + 1 }), { disabled: ctx.prefs.fontSize >= MAX_FONT }),
        item("zoom-out", "Zoom Out (Editor Text)", () => a.setPrefs({ fontSize: ctx.prefs.fontSize - 1 }), { disabled: ctx.prefs.fontSize <= MIN_FONT }),
        item("zoom-reset", "Reset Zoom", () => a.setPrefs({ fontSize: 14 }), { disabled: ctx.prefs.fontSize === 14 }),
        sep,
        item("theme", "Toggle Light or Dark Theme", a.toggleTheme),
      ],
    },
    {
      id: "go",
      label: "Go",
      items: [
        item("go-file", "Go to File...", a.palette, { keys: ["Mod", "K"] }),
        ed("go-line", "Go to Line...", "editor.action.gotoLine", ["Ctrl", "G"]),
        ed("go-symbol", "Go to Symbol in File...", "editor.action.quickOutline", ["Mod", "Shift", "O"]),
        ed("go-definition", "Go to Definition", "editor.action.revealDefinition", ["F12"]),
        sep,
        ed("next-problem", "Next Problem", "editor.action.marker.next", ["F8"]),
        ed("prev-problem", "Previous Problem", "editor.action.marker.prev", ["Shift", "F8"]),
      ],
    },
    {
      id: "run",
      label: "Run",
      items: [
        item("run", "Run Code", a.run, { keys: ["Mod", "Enter"], disabled: ctx.busy || !ctx.hasFile }),
        item("stop", "Stop", a.stop, { disabled: !ctx.busy }),
        sep,
        item("add-package", "Add Package (npm or pip)...", a.addPackage),
      ],
    },
    {
      id: "terminal",
      label: "Terminal",
      items: [
        item("toggle-terminal", "Show or Hide Terminal", a.toggleTerminal, { keys: ["Mod", "J"] }),
        item("focus-terminal", "Focus Terminal", a.focusTerminal),
        item("clear-terminal", "Clear Terminal", a.clearTerminal),
        sep,
        item("terminal-package", "Add Package (npm or pip)...", a.addPackage),
      ],
    },
    {
      id: "help",
      label: "Help",
      items: [item("shortcuts", "Keyboard Shortcuts", a.showShortcuts, { keys: ["?"] })],
    },
  ];
}
