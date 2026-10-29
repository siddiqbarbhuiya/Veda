"use client";

import { useEffect, useMemo, useState } from "react";
import { createBrowserClient } from "@/lib/supabase/client";
import { providerName } from "@/lib/key-providers";

export type Rate = { input_paise_per_1k_tokens: number; output_paise_per_1k_tokens: number };

/** One row in the model picker. `key` is "provider|model". */
export type ModelItem = {
  key: string;
  provider: string;
  model: string;
  /** Short name shown in the list. */
  label: string;
  /** Group heading in the list, for example "OpenRouter". */
  group: string;
  free: boolean;
  /** True when the student has a saved key for this provider. Null while the keys load. */
  keyed: boolean | null;
  rate: Rate | null;
  /** Extra text, for example the context size. */
  hint?: string;
};

type OpenRouterRow = {
  id: string;
  name: string;
  context_length: number;
  free: boolean;
  rate: Rate;
};

export const itemKey = (provider: string, model: string) => `${provider}|${model}`;

// The OpenRouter list is large and public. Keep it for the whole page visit.
let openrouterCache: OpenRouterRow[] | null = null;

function ctxHint(n: number): string | undefined {
  if (!n) return undefined;
  return n >= 1_000_000 ? `${Math.round(n / 100_000) / 10}M ctx` : `${Math.round(n / 1000)}K ctx`;
}

/**
 * Models the student can pick: the priced list from `rate_config` plus every OpenRouter model.
 * `providers` limits the list (the Claude Code tab uses only anthropic and openrouter).
 */
export function useModelCatalog(providers?: readonly string[]) {
  const [rates, setRates] = useState<(Rate & { provider: string; model: string })[]>([]);
  const [ratesState, setRatesState] = useState<"loading" | "ready" | "error">("loading");
  const [keyed, setKeyed] = useState<Set<string> | null>(null);
  const [openrouter, setOpenrouter] = useState<OpenRouterRow[]>(openrouterCache ?? []);

  useEffect(() => {
    let cancelled = false;
    createBrowserClient()
      .from("rate_config")
      .select("provider, model, input_paise_per_1k_tokens, output_paise_per_1k_tokens")
      .eq("is_active", true)
      .order("provider")
      .order("model")
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error || !data) {
          setRatesState("error");
          return;
        }
        setRates(data as (Rate & { provider: string; model: string })[]);
        setRatesState("ready");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/keys")
      .then((res) => (res.ok ? res.json() : null))
      .then((rows: { provider?: string }[] | null) => {
        if (cancelled || !Array.isArray(rows)) return;
        setKeyed(new Set(rows.map((r) => r.provider).filter((p): p is string => typeof p === "string")));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (openrouterCache) return;
    let cancelled = false;
    fetch("/api/models/openrouter")
      .then((res) => (res.ok ? res.json() : null))
      .then((body: { models?: OpenRouterRow[] } | null) => {
        if (cancelled || !body || !Array.isArray(body.models)) return;
        openrouterCache = body.models;
        setOpenrouter(body.models);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const items = useMemo<ModelItem[]>(() => {
    const has = (p: string) => (keyed ? keyed.has(p) : null);
    const out: ModelItem[] = [];
    for (const r of rates) {
      if (providers && !providers.includes(r.provider)) continue;
      out.push({
        key: itemKey(r.provider, r.model),
        provider: r.provider,
        model: r.model,
        label: r.model,
        group: providerName(r.provider),
        free: r.input_paise_per_1k_tokens === 0 && r.output_paise_per_1k_tokens === 0,
        keyed: has(r.provider),
        rate: r,
      });
    }
    if (!providers || providers.includes("openrouter")) {
      const orKeyed = has("openrouter");
      for (const m of openrouter) {
        out.push({
          key: itemKey("openrouter", m.id),
          provider: "openrouter",
          model: m.id,
          label: m.name || m.id,
          group: "OpenRouter",
          free: m.free,
          keyed: orKeyed,
          rate: m.rate,
          hint: ctxHint(m.context_length),
        });
      }
    }
    return out;
  }, [rates, openrouter, keyed, providers]);

  return { items, state: ratesState, keyed };
}
