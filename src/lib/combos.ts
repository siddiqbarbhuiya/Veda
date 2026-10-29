/** One model in a combo. */
export type ComboEntry = { provider: string; model: string };

/** An ordered list of models. The strategy says how the first entry is chosen. */
export type Combo = {
  id: string;
  name: string;
  strategy: "priority" | "round_robin";
  entries: ComboEntry[];
};

export const MAX_COMBO_ENTRIES = 5;

/**
 * Entries in the order to try them.
 * Priority keeps the saved order. Round robin starts at `counter % length` and wraps.
 */
export function orderEntries(combo: Combo, counter: number): ComboEntry[] {
  const list = combo.entries;
  if (combo.strategy !== "round_robin" || list.length < 2) return list.slice();
  const start = ((counter % list.length) + list.length) % list.length;
  return [...list.slice(start), ...list.slice(0, start)];
}

/**
 * True when a failed request should move on to the next entry.
 * 429 (limit) and 5xx (provider down) move on. Status 0 is a network failure.
 * Other 4xx stay: the request itself is wrong, and the next model would fail the same way.
 */
export function isFallbackStatus(status: number): boolean {
  return status === 0 || status === 429 || status >= 500;
}

/** Read a list of entries from untrusted input. Returns null when any entry is wrong. */
export function parseEntries(raw: unknown, max: number): ComboEntry[] | null {
  if (raw === undefined) return [];
  if (!Array.isArray(raw) || raw.length > max) return null;
  const out: ComboEntry[] = [];
  for (const e of raw) {
    const r = e as Record<string, unknown> | null;
    if (!r || typeof r.provider !== "string" || typeof r.model !== "string") return null;
    if (!r.provider || !r.model || r.model.length > 200) return null;
    out.push({ provider: r.provider, model: r.model });
  }
  return out;
}
