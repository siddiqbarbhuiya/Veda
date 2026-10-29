import { extOf } from "@/lib/files/ext";

const LANGS: Record<string, string> = {
  js: "javascript", jsx: "javascript", mjs: "javascript", cjs: "javascript",
  ts: "typescript", tsx: "typescript", json: "json", md: "markdown",
  py: "python", html: "html", css: "css", sh: "shell", yml: "yaml", yaml: "yaml",
  java: "java", c: "c", h: "c", cpp: "cpp", cc: "cpp", hpp: "cpp",
  go: "go", rs: "rust", php: "php", sql: "sql", rb: "ruby", kt: "kotlin", swift: "swift",
  xml: "xml", svg: "xml", toml: "ini", ini: "ini", env: "ini", txt: "plaintext",
};

const BY_NAME: Record<string, string> = { dockerfile: "dockerfile", makefile: "shell" };

/** Monaco language id for a file name. */
export function languageFor(name: string): string {
  const lower = name.toLowerCase();
  if (BY_NAME[lower]) return BY_NAME[lower];
  if (lower === ".env" || lower.startsWith(".env.")) return "ini";
  return LANGS[extOf(name)] ?? "plaintext";
}
