"use client";

import { useSyncExternalStore } from "react";

export type ViewportMode = "small" | "medium" | "large";

const SMALL = "(max-width: 767px)";
const MEDIUM = "(max-width: 1023px)";

function subscribe(cb: () => void) {
  const queries = [window.matchMedia(SMALL), window.matchMedia(MEDIUM)];
  queries.forEach((q) => q.addEventListener("change", cb));
  return () => queries.forEach((q) => q.removeEventListener("change", cb));
}

function snapshot(): ViewportMode {
  if (window.matchMedia(SMALL).matches) return "small";
  if (window.matchMedia(MEDIUM).matches) return "medium";
  return "large";
}

/** small < 768px, medium 768 to 1023px, large from 1024px. */
export function useViewportMode(): ViewportMode {
  return useSyncExternalStore(subscribe, snapshot, () => "large");
}
