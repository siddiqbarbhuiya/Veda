import type { Monaco } from "@monaco-editor/react";

export type VedaTheme = "dark" | "light";

// Syntax colours from the design brief. Surface colours are read from CSS variables at runtime.
const SYNTAX = {
  dark: { keyword: "B794F6", string: "7EE787", number: "FFB86C", fn: "79C0FF", type: "FFA657", comment: "8892A6" },
  light: { keyword: "6D28D9", string: "15803D", number: "B45309", fn: "1D4ED8", type: "9A3412", comment: "5B6678" },
} as const;

function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

// Monaco accepts only #rrggbb or #rrggbbaa. Tokens may be hex or rgba().
function toHex(value: string, fallback = "#000000"): string {
  const v = value.trim();
  if (/^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(v)) return v;
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(v);
  if (short) return `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`;
  const m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+%?))?\s*\)$/i.exec(v);
  if (!m) return fallback;
  const h = (n: number) => Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, "0");
  let hex = `#${h(+m[1])}${h(+m[2])}${h(+m[3])}`;
  if (m[4] !== undefined) {
    const a = m[4].endsWith("%") ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
    if (a < 1) hex += h(a * 255);
  }
  return hex;
}

/** Defines `veda-dark` or `veda-light` from the live CSS variables and activates it. */
export function applyVedaTheme(monaco: Monaco, theme: VedaTheme): void {
  const s = SYNTAX[theme];
  const c = (name: string, fb?: string) => toHex(cssVar(name), fb);
  const name = `veda-${theme}`;
  monaco.editor.defineTheme(name, {
    base: theme === "dark" ? "vs-dark" : "vs",
    inherit: true,
    rules: [
      { token: "keyword", foreground: s.keyword },
      { token: "keyword.control", foreground: s.keyword },
      { token: "string", foreground: s.string },
      { token: "string.escape", foreground: s.number },
      { token: "number", foreground: s.number },
      { token: "constant", foreground: s.number },
      { token: "predefined", foreground: s.fn },
      { token: "function", foreground: s.fn },
      { token: "tag", foreground: s.fn },
      { token: "type", foreground: s.type },
      { token: "type.identifier", foreground: s.type },
      { token: "attribute.name", foreground: s.type },
      { token: "comment", foreground: s.comment, fontStyle: "italic" },
    ],
    colors: {
      "editor.background": c("--bg-editor"),
      "editor.foreground": c("--text-primary"),
      "editorLineNumber.foreground": c("--text-muted"),
      "editorLineNumber.activeForeground": c("--text-secondary"),
      "editor.selectionBackground": c("--selection"),
      "editor.inactiveSelectionBackground": c("--selection"),
      "editor.lineHighlightBackground": c("--bg-elevated"),
      "editor.lineHighlightBorder": "#00000000",
      "editorCursor.foreground": c("--accent-text"),
      "editorIndentGuide.background1": c("--border-subtle"),
      "editorIndentGuide.activeBackground1": c("--border-default"),
      "editorWhitespace.foreground": c("--border-default"),
      "editorWidget.background": c("--bg-overlay"),
      "editorWidget.border": c("--border-default"),
      "editorSuggestWidget.background": c("--bg-overlay"),
      "editorSuggestWidget.border": c("--border-default"),
      "editorSuggestWidget.selectedBackground": c("--accent-subtle"),
      "editorHoverWidget.background": c("--bg-overlay"),
      "editorHoverWidget.border": c("--border-default"),
      "input.background": c("--bg-sunken"),
      "scrollbarSlider.background": c("--border-default", "#343b4a") + "80",
      "scrollbarSlider.hoverBackground": c("--border-control", "#66718a") + "99",
      "focusBorder": c("--accent"),
    },
  });
  monaco.editor.setTheme(name);
}

/** Resolves the --font-mono stack (JetBrains Mono plus fallbacks) to a concrete font-family string. */
export function editorFontFamily(): string {
  try {
    const probe = document.createElement("span");
    probe.className = "font-mono";
    probe.style.position = "absolute";
    probe.style.visibility = "hidden";
    document.body.appendChild(probe);
    const family = getComputedStyle(probe).fontFamily;
    probe.remove();
    return family || "monospace";
  } catch {
    return "monospace";
  }
}
