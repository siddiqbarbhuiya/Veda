/** One model from the OpenRouter catalogue. */
export type OpenRouterModel = {
  id: string;
  name: string;
  context_length: number;
  /** True when both the prompt and the completion price are 0. */
  free: boolean;
  prompt_usd_per_token: number;
  completion_usd_per_token: number;
};

const MODELS_URL = 'https://openrouter.ai/api/v1/models';
const CACHE_MS = 10 * 60 * 1000;

function price(value: unknown): number | null {
  const n = typeof value === 'string' || typeof value === 'number' ? Number(value) : NaN;
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** Read the `/models` response. Entries without a string id are dropped. */
export function parseModels(json: unknown): OpenRouterModel[] {
  const data = (json as { data?: unknown } | null)?.data;
  if (!Array.isArray(data)) return [];
  const out: OpenRouterModel[] = [];
  for (const raw of data) {
    const m = raw as Record<string, unknown> | null;
    if (!m || typeof m.id !== 'string' || !m.id) continue;
    const pricing = (m.pricing ?? {}) as Record<string, unknown>;
    const prompt = price(pricing.prompt);
    const completion = price(pricing.completion);
    out.push({
      id: m.id,
      name: typeof m.name === 'string' && m.name ? m.name : m.id,
      context_length: typeof m.context_length === 'number' ? m.context_length : 0,
      free: prompt === 0 && completion === 0,
      prompt_usd_per_token: prompt ?? 0,
      completion_usd_per_token: completion ?? 0,
    });
  }
  return out;
}

let cache: { at: number; models: OpenRouterModel[] } | null = null;

/** Fetch the catalogue. The result is cached for 10 minutes. A failed refresh returns the old list when there is one. */
export async function fetchOpenRouterModels(): Promise<OpenRouterModel[]> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.models;
  try {
    const res = await fetch(MODELS_URL, { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`OpenRouter models request failed (${res.status})`);
    const models = parseModels(await res.json());
    cache = { at: Date.now(), models };
    return models;
  } catch (err) {
    if (cache) return cache.models;
    throw err;
  }
}

/** Test helper: forget the cached list. */
export function resetModelsCache(): void {
  cache = null;
}

const paise = (usdPerToken: number, usdInr: number, margin: number) =>
  // 6 decimals removes float noise (0.27 * 100 = 27.000000000000004) before the round up.
  Math.ceil(Number((usdPerToken * 1000 * usdInr * 100 * margin).toFixed(6)));

/**
 * Provisional rate in paise per 1k tokens. Pricing is not decided yet (docs/product/pricing-later.md).
 * The defaults come from OPENROUTER_USD_INR and OPENROUTER_MARGIN.
 */
export function rateForModel(
  m: OpenRouterModel,
  env: { usdInr?: number; margin?: number } = {}
): { input_paise_per_1k_tokens: number; output_paise_per_1k_tokens: number } {
  if (m.free) return { input_paise_per_1k_tokens: 0, output_paise_per_1k_tokens: 0 };
  const usdInr = env.usdInr ?? (Number(process.env.OPENROUTER_USD_INR) || 90);
  const margin = env.margin ?? (Number(process.env.OPENROUTER_MARGIN) || 1);
  return {
    input_paise_per_1k_tokens: paise(m.prompt_usd_per_token, usdInr, margin),
    output_paise_per_1k_tokens: paise(m.completion_usd_per_token, usdInr, margin),
  };
}
