/** pip package names for Python in the browser (Pyodide + micropip). */

export type PipCheck = { ok: true; value: string } | { ok: false; reason: string };

const NAME = "[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?";
const EXTRAS = "(?:\\[[A-Za-z0-9._,-]+\\])?";
const VERSION = "[A-Za-z0-9._*+!-]+";
const CLAUSE = `(?:==|>=|<=|~=|!=|>|<)${VERSION}`;
const SPEC = new RegExp(`^${NAME}${EXTRAS}(?:${CLAUSE}(?:,${CLAUSE})*)?$`);

/** Check one requirement such as `requests`, `numpy==1.26.4` or `rich>=13,<14`. URLs, paths and options are refused. */
export function validatePipSpec(input: string): PipCheck {
  const value = input.trim();
  if (!value) return { ok: false, reason: "Enter a package name." };
  if (value.length > 200) return { ok: false, reason: "The package name is too long." };
  if (/\s/.test(value)) return { ok: false, reason: "Enter one package at a time, without spaces." };
  if (value.startsWith("-")) return { ok: false, reason: "A package name cannot start with a dash." };
  if (/[:/\\@]/.test(value)) return { ok: false, reason: "Use a package name from PyPI, not a path or a URL." };
  if (!SPEC.test(value)) return { ok: false, reason: "This is not a valid package name. Examples: requests, numpy==1.26.4" };
  return { ok: true, value };
}

/** The package name of a requirement, in the form that pip compares: lower case, with `-` for `_` and `.`. */
export function requirementName(spec: string): string {
  const m = /^[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?/.exec(spec.trim());
  return (m ? m[0] : spec.trim()).toLowerCase().replace(/[-_.]+/g, "-");
}

/** The valid requirements in a `requirements.txt`. Comments, blank lines, options and bad lines are skipped. */
export function parseRequirements(text: string | undefined): string[] {
  if (!text) return [];
  const out: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/\s+#.*$/, "").trim();
    if (!line || line.startsWith("#")) continue;
    const check = validatePipSpec(line);
    if (check.ok) out.push(check.value);
  }
  return out;
}

/** `requirements.txt` text with `spec` added. A package that is listed already is replaced, not repeated. */
export function addRequirement(text: string | undefined, spec: string): string {
  const name = requirementName(spec);
  const lines = (text ?? "").split(/\r?\n/);
  while (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  let replaced = false;
  const next = lines.map((line) => {
    const trimmed = line.replace(/\s+#.*$/, "").trim();
    if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("-")) return line;
    if (requirementName(trimmed) !== name) return line;
    replaced = true;
    return spec;
  });
  if (!replaced) next.push(spec);
  return next.join("\n") + "\n";
}

/** `requirements.txt` text without the package `name`. Other lines, comments and options stay as they are. */
export function removeRequirement(text: string | undefined, name: string): string {
  const target = requirementName(name);
  const lines = (text ?? "").split(/\r?\n/);
  while (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  const kept = lines.filter((line) => {
    const trimmed = line.replace(/\s+#.*$/, "").trim();
    if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("-")) return true;
    return requirementName(trimmed) !== target;
  });
  return kept.length > 0 ? kept.join("\n") + "\n" : "";
}
