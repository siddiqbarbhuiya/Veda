import { describe, expect, it, vi } from "vitest";
import { DEFAULT_PREFS, MAX_FONT, MIN_FONT, clampFont, parsePrefs } from "../editor-prefs";
import { buildMenus, type Menu, type MenuActions, type MenuContext, type MenuItem } from "../menu-model";

function fakeActions(): MenuActions {
  const fn = () => vi.fn();
  return {
    newFile: fn(), newFolder: fn(), newFromTemplate: fn(), openProjects: fn(), save: fn(), exportZip: fn(),
    goDashboard: fn(), signOut: fn(), palette: fn(), toggleSidebar: fn(), toggleTerminal: fn(), toggleChat: fn(),
    toggleTheme: fn(), showShortcuts: fn(), run: fn(), stop: fn(), addPackage: fn(), focusTerminal: fn(),
    clearTerminal: fn(), editor: fn(), paste: fn(), setPrefs: fn(),
  };
}

const ctx = (over: Partial<MenuContext> = {}): MenuContext => ({ hasFile: true, busy: false, prefs: DEFAULT_PREFS, ...over });

const items = (menus: Menu[], id: string) => menus.find((m) => m.id === id)!.items;
const find = (menus: Menu[], menuId: string, itemId: string) =>
  items(menus, menuId).find((i): i is Extract<MenuItem, { type: "item" }> => i.type === "item" && i.id === itemId)!;

describe("buildMenus", () => {
  it("has the VS Code menus in order", () => {
    const menus = buildMenus(fakeActions(), ctx());
    expect(menus.map((m) => m.label)).toEqual(["File", "Edit", "Selection", "View", "Go", "Run", "Terminal", "Help"]);
  });

  it("never starts or ends a menu with a separator, and never repeats one", () => {
    for (const m of buildMenus(fakeActions(), ctx())) {
      expect(m.items[0].type, m.id).toBe("item");
      expect(m.items[m.items.length - 1].type, m.id).toBe("item");
      m.items.forEach((it, i) => {
        if (it.type === "separator") expect(m.items[i - 1].type, m.id).toBe("item");
      });
    }
  });

  it("gives every item in a menu a different id and a label", () => {
    for (const m of buildMenus(fakeActions(), ctx())) {
      const ids = m.items.filter((i) => i.type === "item").map((i) => (i as { id: string }).id);
      expect(new Set(ids).size, m.id).toBe(ids.length);
      for (const i of m.items) if (i.type === "item") expect(i.label.length).toBeGreaterThan(0);
    }
  });

  it("runs the shell actions", () => {
    const a = fakeActions();
    const menus = buildMenus(a, ctx());
    find(menus, "file", "new-file").run();
    find(menus, "file", "export").run();
    find(menus, "file", "projects").run();
    find(menus, "run", "add-package").run();
    expect(a.newFile).toHaveBeenCalledOnce();
    expect(a.exportZip).toHaveBeenCalledOnce();
    expect(a.openProjects).toHaveBeenCalledOnce();
    expect(a.addPackage).toHaveBeenCalledOnce();
  });

  it("sends editor commands to the editor by Monaco action id", () => {
    const a = fakeActions();
    const menus = buildMenus(a, ctx());
    find(menus, "edit", "find").run();
    find(menus, "edit", "undo").run();
    find(menus, "go", "go-line").run();
    expect(a.editor).toHaveBeenNthCalledWith(1, "actions.find");
    expect(a.editor).toHaveBeenNthCalledWith(2, "undo");
    expect(a.editor).toHaveBeenNthCalledWith(3, "editor.action.gotoLine");
  });

  it("disables editor commands when no file is open, but not shell commands", () => {
    const menus = buildMenus(fakeActions(), ctx({ hasFile: false }));
    expect(find(menus, "edit", "find").disabled).toBe(true);
    expect(find(menus, "edit", "paste").disabled).toBe(true);
    expect(find(menus, "selection", "select-all").disabled).toBe(true);
    expect(find(menus, "run", "run").disabled).toBe(true);
    expect(find(menus, "file", "new-file").disabled).toBeUndefined();
    expect(find(menus, "view", "sidebar").disabled).toBeUndefined();
  });

  it("allows Stop only while the runtime is busy, and blocks Run then", () => {
    const idle = buildMenus(fakeActions(), ctx({ busy: false }));
    expect(find(idle, "run", "stop").disabled).toBe(true);
    expect(find(idle, "run", "run").disabled).toBe(false);
    const busy = buildMenus(fakeActions(), ctx({ busy: true }));
    expect(find(busy, "run", "stop").disabled).toBe(false);
    expect(find(busy, "run", "run").disabled).toBe(true);
  });

  it("shows toggles with a check state and flips them", () => {
    const a = fakeActions();
    const menus = buildMenus(a, ctx({ prefs: { ...DEFAULT_PREFS, wordWrap: true } }));
    expect(find(menus, "view", "word-wrap").checked).toBe(true);
    expect(find(menus, "view", "minimap").checked).toBe(false);
    find(menus, "view", "word-wrap").run();
    find(menus, "view", "minimap").run();
    expect(a.setPrefs).toHaveBeenNthCalledWith(1, { wordWrap: false });
    expect(a.setPrefs).toHaveBeenNthCalledWith(2, { minimap: true });
  });

  it("changes the zoom and stops at the limits", () => {
    const a = fakeActions();
    const menus = buildMenus(a, ctx({ prefs: { ...DEFAULT_PREFS, fontSize: 14 } }));
    find(menus, "view", "zoom-in").run();
    find(menus, "view", "zoom-out").run();
    expect(a.setPrefs).toHaveBeenNthCalledWith(1, { fontSize: 15 });
    expect(a.setPrefs).toHaveBeenNthCalledWith(2, { fontSize: 13 });
    expect(find(menus, "view", "zoom-reset").disabled).toBe(true);
    const max = buildMenus(a, ctx({ prefs: { ...DEFAULT_PREFS, fontSize: MAX_FONT } }));
    expect(find(max, "view", "zoom-in").disabled).toBe(true);
    const min = buildMenus(a, ctx({ prefs: { ...DEFAULT_PREFS, fontSize: MIN_FONT } }));
    expect(find(min, "view", "zoom-out").disabled).toBe(true);
  });

  it("does not show a shortcut that Veda uses for something else", () => {
    const menus = buildMenus(fakeActions(), ctx());
    // Ctrl+Shift+L opens the chat in Veda, so "Select all occurrences" must not show it.
    expect(find(menus, "selection", "occurrences").keys).toBeUndefined();
    expect(find(menus, "view", "chat").keys).toEqual(["Mod", "Shift", "L"]);
  });
});

describe("editor prefs", () => {
  it("clamps the font size", () => {
    expect(clampFont(3)).toBe(MIN_FONT);
    expect(clampFont(99)).toBe(MAX_FONT);
    expect(clampFont(15.4)).toBe(15);
    expect(clampFont(NaN)).toBe(DEFAULT_PREFS.fontSize);
  });
  it("reads saved text and repairs bad values", () => {
    expect(parsePrefs(null)).toEqual(DEFAULT_PREFS);
    expect(parsePrefs("{ broken")).toEqual(DEFAULT_PREFS);
    expect(parsePrefs(JSON.stringify({ wordWrap: true, minimap: "yes", fontSize: 99 }))).toEqual({
      wordWrap: true,
      minimap: DEFAULT_PREFS.minimap,
      fontSize: MAX_FONT,
    });
  });
});
