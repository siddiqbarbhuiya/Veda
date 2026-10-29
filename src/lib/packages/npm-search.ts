/** Search the npm registry for packages. The registry allows requests from the browser. */

export type NpmResult = {
  name: string;
  version: string;
  description: string;
  /** Downloads in the last week, when the registry gives it. */
  weekly: number | null;
};

type FetchLike = (url: string, init?: { signal?: AbortSignal }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

export const NPM_SEARCH_URL = "https://registry.npmjs.org/-/v1/search";

/** Read the registry answer. A bad entry is skipped instead of breaking the list. */
export function parseNpmSearch(json: unknown): NpmResult[] {
  const objects = (json as { objects?: unknown })?.objects;
  if (!Array.isArray(objects)) return [];
  const out: NpmResult[] = [];
  for (const o of objects) {
    const pkg = (o as { package?: Record<string, unknown> })?.package;
    if (!pkg || typeof pkg.name !== "string" || typeof pkg.version !== "string") continue;
    const downloads = (o as { downloads?: { weekly?: unknown } }).downloads;
    out.push({
      name: pkg.name,
      version: pkg.version,
      description: typeof pkg.description === "string" ? pkg.description : "",
      weekly: typeof downloads?.weekly === "number" ? downloads.weekly : null,
    });
  }
  return out;
}

/** The search address for a text. */
export function npmSearchUrl(query: string, size = 8): string {
  return `${NPM_SEARCH_URL}?text=${encodeURIComponent(query.trim())}&size=${size}`;
}

/** Search npm. Throws when the registry cannot be reached. */
export async function searchNpm(
  query: string,
  options: { signal?: AbortSignal; fetchImpl?: FetchLike; size?: number } = {}
): Promise<NpmResult[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const doFetch: FetchLike = options.fetchImpl ?? ((url, init) => fetch(url, init));
  const res = await doFetch(npmSearchUrl(q, options.size), { signal: options.signal });
  if (!res.ok) throw new Error(`The npm search answered with status ${res.status}.`);
  return parseNpmSearch(await res.json());
}

/** A short count for the list, for example "12.3M/week". */
export function formatDownloads(n: number | null): string {
  if (n === null) return "";
  if (n < 1000) return `${n}/week`;
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0).replace(/\.0$/, "")}K/week`;
  if (n < 1_000_000_000) return `${(n / 1_000_000).toFixed(n < 10_000_000 ? 1 : 0).replace(/\.0$/, "")}M/week`;
  return `${(n / 1_000_000_000).toFixed(1).replace(/\.0$/, "")}B/week`;
}
