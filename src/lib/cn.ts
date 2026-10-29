export type ClassValue = string | false | null | undefined;

/*
 * Minimal conflict-safe class merge. No packages.
 * When two classes in the same group and the same variant (for example both "sm:") conflict,
 * the LAST one wins and the earlier one is dropped.
 * Supported groups: display, height, width, size, padding (p, px, py, pt, pr, pb, pl), text size.
 * Any other class is kept as is. Variants (sm:, hover: ...) and "!" important are part of the key,
 * so "h-9 sm:h-11" keeps both.
 */

const DISPLAY = new Set([
  "block",
  "inline",
  "inline-block",
  "flex",
  "inline-flex",
  "grid",
  "inline-grid",
  "contents",
  "hidden",
  "table",
  "flow-root",
]);

const TEXT_SIZE = /^text-(xs|sm|base|lg|xl|[2-9]xl|ui|caption|overline|\[\d+(\.\d+)?(px|rem|em)\])$/;

const PADDING_ALL = ["px", "py", "pt", "pr", "pb", "pl", "ps", "pe"];

function splitVariant(token: string): [string, string] {
  let depth = 0;
  let cut = -1;
  for (let i = 0; i < token.length; i++) {
    const c = token[i];
    if (c === "[") depth++;
    else if (c === "]") depth--;
    else if (c === ":" && depth === 0) cut = i;
  }
  return cut < 0 ? ["", token] : [token.slice(0, cut + 1), token.slice(cut + 1)];
}

// Returns [own group, groups that this class overrides when it comes later].
function groupOf(utility: string): [string, string[]] | null {
  let u = utility;
  let important = "";
  if (u.startsWith("!")) {
    u = u.slice(1);
    important = "!";
  } else if (u.endsWith("!")) {
    u = u.slice(0, -1);
    important = "!";
  }
  const tag = (g: string) => g + important;
  if (DISPLAY.has(u)) return [tag("display"), []];
  if (/^h-./.test(u)) return [tag("h"), []];
  if (/^w-./.test(u)) return [tag("w"), []];
  if (/^size-./.test(u)) return [tag("size"), [tag("h"), tag("w")]];
  if (/^p-./.test(u)) return [tag("p"), PADDING_ALL.map(tag)];
  const pad = /^(px|py|pt|pr|pb|pl|ps|pe)-./.exec(u);
  if (pad) return [tag(pad[1]), []];
  if (TEXT_SIZE.test(u)) return [tag("text-size"), []];
  return null;
}

export function cn(...values: ClassValue[]): string {
  const tokens = values
    .filter(Boolean)
    .join(" ")
    .split(/\s+/)
    .filter(Boolean);
  const seen = new Set<string>();
  const kept: string[] = [];
  for (let i = tokens.length - 1; i >= 0; i--) {
    const token = tokens[i];
    const [variant, utility] = splitVariant(token);
    const info = groupOf(utility);
    if (!info) {
      kept.push(token);
      continue;
    }
    const key = variant + info[0];
    if (seen.has(key)) continue;
    seen.add(key);
    for (const over of info[1]) seen.add(variant + over);
    kept.push(token);
  }
  return kept.reverse().join(" ");
}
