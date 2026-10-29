"use client";

import { useSyncExternalStore } from "react";
import { NO_COMBOS, getCombosSnapshot, subscribeCombos, type CombosState } from "@/lib/combo-storage";
import type { Combo } from "@/lib/combos";

/**
 * The saved combos and the one in use. Chat and Claude Code read the same store,
 * so a combo made in one tab is there in the other at once.
 */
export function useCombos(): CombosState & { active: Combo | null } {
  const state = useSyncExternalStore(subscribeCombos, getCombosSnapshot, () => NO_COMBOS);
  const active = state.combos.find((c) => c.id === state.activeId) ?? null;
  return { ...state, active };
}
