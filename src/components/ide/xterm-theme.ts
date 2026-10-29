import type { ITheme } from "@xterm/xterm";

function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/** Builds the xterm theme from the live CSS variables so it follows the active theme. */
export function buildXtermTheme(): ITheme {
  const v = cssVar;
  const success = v("--success");
  const warning = v("--warning");
  const danger = v("--danger");
  const info = v("--info");
  const accent = v("--accent-text");
  const fg = v("--text-primary");
  const muted = v("--text-muted");
  return {
    background: v("--bg-panel"),
    foreground: fg,
    cursor: accent,
    cursorAccent: v("--bg-panel"),
    selectionBackground: v("--selection"),
    black: v("--bg-app"),
    red: danger,
    green: success,
    yellow: warning,
    blue: info,
    magenta: accent,
    cyan: info,
    white: v("--text-secondary"),
    brightBlack: muted,
    brightRed: danger,
    brightGreen: success,
    brightYellow: warning,
    brightBlue: info,
    brightMagenta: accent,
    brightCyan: info,
    brightWhite: fg,
  };
}

/** Resolves the --font-mono stack to a concrete font-family string. */
export function terminalFontFamily(): string {
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
