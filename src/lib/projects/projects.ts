/** Rules for the user's list of projects. Pure functions, no storage. */

export const DEFAULT_PROJECT = "default";

/** A user can own at most this many projects. The database policy enforces the same number. */
export const MAX_PROJECTS = 20;

export const MAX_PROJECT_NAME = 60;

export type ProjectInfo = {
  name: string;
  /** Time of the last edit, in milliseconds. */
  updatedAt: number;
  /** Where the project exists: only this browser, only the cloud, or both. */
  source: "local" | "cloud" | "both";
};

export type NameCheck = { ok: true; value: string } | { ok: false; reason: string };

// Letters and digits of any script (Hindi, Bengali, Tamil, and so on), their combining marks (vowel signs),
// spaces, dot, dash and underscore. "#" and ":" are not allowed because the storage keys use them.
const ALLOWED = /^[\p{L}\p{N}][\p{L}\p{M}\p{N} ._-]*$/u;

/** Check a new project name against the rules and against the names that exist (compared without case). */
export function validateProjectName(raw: string, existing: string[]): NameCheck {
  const value = raw.trim().replace(/\s+/g, " ");
  if (!value) return { ok: false, reason: "Enter a project name." };
  if (value.length > MAX_PROJECT_NAME) return { ok: false, reason: `Use at most ${MAX_PROJECT_NAME} characters.` };
  if (!ALLOWED.test(value)) {
    return { ok: false, reason: "Use letters, digits, spaces, dots, dashes and underscores. Start with a letter or a digit." };
  }
  if (/[. ]$/.test(value)) return { ok: false, reason: "The name cannot end with a dot or a space." };
  const lower = value.toLowerCase();
  if (existing.some((n) => n.toLowerCase() === lower)) return { ok: false, reason: "A project with this name exists." };
  return { ok: true, value };
}

type Listed = { name: string; updatedAt: number };

/** Join the cloud list and the browser list by name. The newest project is first. */
export function mergeProjects(cloud: Listed[], local: Listed[]): ProjectInfo[] {
  const byName = new Map<string, ProjectInfo>();
  for (const c of cloud) byName.set(c.name, { name: c.name, updatedAt: c.updatedAt, source: "cloud" });
  for (const l of local) {
    const hit = byName.get(l.name);
    if (hit) byName.set(l.name, { name: l.name, updatedAt: Math.max(hit.updatedAt, l.updatedAt), source: "both" });
    else byName.set(l.name, { name: l.name, updatedAt: l.updatedAt, source: "local" });
  }
  return [...byName.values()].sort((a, b) => b.updatedAt - a.updatedAt || a.name.localeCompare(b.name));
}

/** The project that a URL asks for (`/ide?project=...`). A missing or bad value gives the default project. */
export function projectFromSearch(search: string): string {
  const value = new URLSearchParams(search).get("project")?.trim() ?? "";
  if (!value || value.length > MAX_PROJECT_NAME || !ALLOWED.test(value) || /[. ]$/.test(value)) return DEFAULT_PROJECT;
  return value;
}

/** The address of the IDE for a project. The default project keeps the plain `/ide` address. */
export function projectHref(name: string): string {
  return name === DEFAULT_PROJECT ? "/ide" : `/ide?project=${encodeURIComponent(name)}`;
}

/** A short time for the project list, for example "5 min ago". `updatedAt` 0 means the project is not saved yet. */
export function formatUpdated(updatedAt: number, now: number = Date.now()): string {
  if (updatedAt <= 0) return "Not saved yet";
  const seconds = Math.max(0, Math.round((now - updatedAt) / 1000));
  if (seconds < 60) return "Just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return days === 1 ? "1 day ago" : `${days} days ago`;
  return new Date(updatedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}
