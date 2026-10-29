import { MAX_COMBO_ENTRIES, type Combo } from "@/lib/combos";

const COMBOS_KEY = "veda:combos:v1";
const ACTIVE_KEY = "veda:active-combo:v1";

function isCombo(c: unknown): c is Combo {
  const r = c as Record<string, unknown> | null;
  return (
    !!r &&
    typeof r.id === "string" &&
    typeof r.name === "string" &&
    (r.strategy === "priority" || r.strategy === "round_robin") &&
    Array.isArray(r.entries) &&
    r.entries.length > 0 &&
    r.entries.length <= MAX_COMBO_ENTRIES &&
    r.entries.every(
      (e) => !!e && typeof (e as Record<string, unknown>).provider === "string" && typeof (e as Record<string, unknown>).model === "string",
    )
  );
}

/** Saved combos. Returns [] when storage is blocked or holds bad data. */
export function readCombos(): Combo[] {
  try {
    const raw = localStorage.getItem(COMBOS_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter(isCombo) : [];
  } catch {
    return [];
  }
}

export function writeCombos(combos: Combo[]): void {
  try {
    localStorage.setItem(COMBOS_KEY, JSON.stringify(combos));
  } catch {
    /* storage blocked: combos are not remembered */
  }
}

/** Id of the combo in use, or null when a single model is in use. */
export function readActiveCombo(): string | null {
  try {
    return localStorage.getItem(ACTIVE_KEY);
  } catch {
    return null;
  }
}

export function writeActiveCombo(id: string | null): void {
  try {
    if (id) localStorage.setItem(ACTIVE_KEY, id);
    else localStorage.removeItem(ACTIVE_KEY);
  } catch {
    /* storage blocked */
  }
}
