"use client";

import { useEffect, useRef, useState } from "react";

export type SearchState<T> = { results: T[]; loading: boolean; error: string | null };

function idle<T>(): SearchState<T> {
  return { results: [], loading: false, error: null };
}

/**
 * Search while the user types. It waits `delay` ms after the last key, cancels the older request,
 * and does nothing for a text shorter than `minLength`. `search` must honour the abort signal.
 */
export function usePackageSearch<T>(
  query: string,
  search: (query: string, signal: AbortSignal) => Promise<T[]>,
  options: { minLength?: number; delay?: number } = {}
): SearchState<T> {
  const { minLength = 2, delay = 250 } = options;
  const [state, setState] = useState<SearchState<T>>(idle);
  // The latest search function, so a new function on each render does not restart the request.
  const searchRef = useRef(search);
  useEffect(() => {
    searchRef.current = search;
  });

  useEffect(() => {
    const text = query.trim();
    if (text.length < minLength) {
      // Nothing to search. Clear an old answer.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setState(idle<T>());
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setState((s) => ({ ...s, loading: true, error: null }));
      try {
        const results = await searchRef.current(text, controller.signal);
        if (!controller.signal.aborted) setState({ results, loading: false, error: null });
      } catch (err) {
        if (controller.signal.aborted) return;
        const aborted = err instanceof DOMException && err.name === "AbortError";
        if (!aborted) {
          setState({ results: [], loading: false, error: "The search is not available now. Check your connection, or type the exact name." });
        }
      }
    }, delay);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, minLength, delay]);

  return state;
}
