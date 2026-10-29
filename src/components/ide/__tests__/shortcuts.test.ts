import { describe, expect, it } from "vitest";
import { displayKeys, matchShortcut, type KeyLike, type ShortcutContext } from "../use-ide-shortcuts";

const ctx: ShortcutContext = { inXterm: false, editable: false, otherDialogOpen: false, paletteOpen: false };
const ev = (o: Partial<KeyLike>): KeyLike => ({
  key: "",
  code: "",
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  shiftKey: false,
  ...o,
});

describe("matchShortcut", () => {
  it("matches Ctrl+K and Cmd+K", () => {
    expect(matchShortcut(ev({ key: "k", ctrlKey: true }), ctx)).toBe("palette");
    expect(matchShortcut(ev({ key: "k", metaKey: true }), ctx)).toBe("palette");
  });
  it("uses e.code when key is not a Latin letter", () => {
    expect(matchShortcut(ev({ key: "ক", code: "KeyK", ctrlKey: true }), ctx)).toBe("palette");
    expect(matchShortcut(ev({ key: "Dead", code: "KeyN", altKey: true }), ctx)).toBe("newFile");
  });
  it("handles a missing key", () => {
    expect(matchShortcut(ev({ key: undefined, code: "KeyS", ctrlKey: true }), ctx)).toBe("save");
    expect(matchShortcut(ev({ key: undefined }), ctx)).toBeNull();
  });
  it("ignores repeat and composition", () => {
    expect(matchShortcut(ev({ key: "Enter", ctrlKey: true, repeat: true }), ctx)).toBeNull();
    expect(matchShortcut(ev({ key: "Enter", ctrlKey: true, isComposing: true }), ctx)).toBeNull();
  });
  it("does not steal readline keys inside xterm", () => {
    const x = { ...ctx, inXterm: true };
    expect(matchShortcut(ev({ key: "k", ctrlKey: true }), x)).toBeNull();
    expect(matchShortcut(ev({ key: "b", ctrlKey: true }), x)).toBeNull();
    expect(matchShortcut(ev({ key: "j", ctrlKey: true }), x)).toBeNull();
    expect(matchShortcut(ev({ key: "Enter", ctrlKey: true }), x)).toBe("run");
    expect(matchShortcut(ev({ key: "P", ctrlKey: true, shiftKey: true }), x)).toBe("paletteAlt");
  });
  it("works in editable targets for modified keys but not for ?", () => {
    const ed = { ...ctx, editable: true };
    expect(matchShortcut(ev({ key: "n", altKey: true }), ed)).toBe("newFile");
    expect(matchShortcut(ev({ key: "s", ctrlKey: true }), ed)).toBe("save");
    expect(matchShortcut(ev({ key: "?" }), ed)).toBeNull();
    expect(matchShortcut(ev({ key: "?" }), ctx)).toBe("shortcuts");
  });
  it("blocks everything while another dialog is open", () => {
    const d = { ...ctx, otherDialogOpen: true };
    expect(matchShortcut(ev({ key: "Enter", ctrlKey: true }), d)).toBeNull();
    expect(matchShortcut(ev({ key: "k", ctrlKey: true }), d)).toBeNull();
  });
  it("allows only the palette toggle while the palette is open", () => {
    const p = { ...ctx, paletteOpen: true };
    expect(matchShortcut(ev({ key: "k", ctrlKey: true }), p)).toBe("palette");
    expect(matchShortcut(ev({ key: "b", ctrlKey: true }), p)).toBeNull();
  });
});

describe("displayKeys", () => {
  it("adapts to macOS", () => {
    expect(displayKeys(["Mod", "Alt", "N"], true)).toEqual(["Cmd", "Option", "N"]);
    expect(displayKeys(["Mod", "Alt", "N"], false)).toEqual(["Ctrl", "Alt", "N"]);
  });
});
