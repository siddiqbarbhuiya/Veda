/**
 * Suggestions for pip packages. PyPI has no search service that a browser may call, so there are two sources:
 * the packages that Pyodide ships (a fixed list, matched while the user types), and an exact-name lookup on PyPI.
 */

type FetchLike = (url: string, init?: { signal?: AbortSignal }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

export type PipSuggestion = {
  name: string;
  /** "built-in": Pyodide ships it, so it installs fast. "pypi": found on PyPI. */
  source: "built-in" | "pypi";
  version?: string;
  summary?: string;
};

// Keep this version equal to PYODIDE_VERSION in src/hooks/use-pyodide.ts.
export const PYODIDE_LOCK_URL = "https://cdn.jsdelivr.net/pyodide/v314.0.7/full/pyodide-lock.json";

/** The package names in a Pyodide lock file. Test packages (`numpy-tests`) are left out. */
export function parsePyodideLock(json: unknown): string[] {
  const packages = (json as { packages?: Record<string, { package_type?: string }> })?.packages;
  if (!packages || typeof packages !== "object") return [];
  return Object.entries(packages)
    .filter(([name, info]) => !name.endsWith("-tests") && info?.package_type !== "cpython_module")
    .map(([name]) => name)
    .sort();
}

/** Names that match the text: exact first, then names that start with it, then names that contain it. */
export function matchBuiltIn(names: string[], query: string, limit = 6): string[] {
  const q = query.trim().toLowerCase();
  if (q.length < 1) return [];
  const exact: string[] = [];
  const prefix: string[] = [];
  const contains: string[] = [];
  for (const n of names) {
    const l = n.toLowerCase();
    if (l === q) exact.push(n);
    else if (l.startsWith(q)) prefix.push(n);
    else if (l.includes(q)) contains.push(n);
  }
  return [...exact, ...prefix, ...contains].slice(0, limit);
}

let lockCache: Promise<string[]> | null = null;

/** The built-in package names, loaded once. A failed load is not kept, so the next call tries again. */
export function loadBuiltInNames(fetchImpl?: FetchLike): Promise<string[]> {
  if (!lockCache) {
    const doFetch: FetchLike = fetchImpl ?? ((url, init) => fetch(url, init));
    lockCache = doFetch(PYODIDE_LOCK_URL)
      .then(async (res) => {
        if (!res.ok) throw new Error(`status ${res.status}`);
        return parsePyodideLock(await res.json());
      })
      .catch((err) => {
        lockCache = null;
        throw err;
      });
  }
  return lockCache;
}

/** Look up one exact package name on PyPI. Returns null when it does not exist. Throws on a network error. */
export async function lookupPypi(
  name: string,
  options: { signal?: AbortSignal; fetchImpl?: FetchLike } = {}
): Promise<PipSuggestion | null> {
  const clean = name.trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(clean)) return null;
  const doFetch: FetchLike = options.fetchImpl ?? ((url, init) => fetch(url, init));
  const res = await doFetch(`https://pypi.org/pypi/${encodeURIComponent(clean)}/json`, { signal: options.signal });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`PyPI answered with status ${res.status}.`);
  const info = ((await res.json()) as { info?: { name?: unknown; version?: unknown; summary?: unknown } }).info;
  if (!info || typeof info.name !== "string") return null;
  return {
    name: info.name,
    source: "pypi",
    version: typeof info.version === "string" ? info.version : undefined,
    summary: typeof info.summary === "string" ? info.summary : undefined,
  };
}
