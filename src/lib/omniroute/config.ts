import { parseBaseUrl, assertPublicHost } from "./url";

/** What a student saved for their own OmniRoute. It is stored encrypted, as JSON, in `api_keys`. */
export type OmniRouteConfig = { baseUrl: string; apiKey: string };

export const encodeConfig = (c: OmniRouteConfig): string => JSON.stringify({ baseUrl: c.baseUrl, apiKey: c.apiKey });

/** Read the stored text. Returns null for anything that is not a valid config (checked again: the rules may have changed). */
export function decodeConfig(text: string): OmniRouteConfig | null {
  try {
    const j = JSON.parse(text) as Partial<OmniRouteConfig>;
    if (typeof j.baseUrl !== "string" || typeof j.apiKey !== "string" || !j.apiKey) return null;
    const checked = parseBaseUrl(j.baseUrl);
    return checked.ok ? { baseUrl: checked.url, apiKey: j.apiKey } : null;
  } catch {
    return null;
  }
}

const TIMEOUT_MS = 15_000;

/**
 * A request to the student's OmniRoute. Redirects are not followed, so a public address cannot bounce the server
 * to a private one. The host is checked before the request.
 */
export async function omniFetch(
  cfg: OmniRouteConfig,
  path: string,
  init: RequestInit & { timeoutMs?: number | null } = {}
): Promise<Response> {
  await assertPublicHost(cfg.baseUrl);
  const { timeoutMs, ...rest } = init;
  // A streaming reply can run for minutes, so callers pass null to use only their own abort signal.
  const timeout = timeoutMs === null ? null : AbortSignal.timeout(timeoutMs ?? TIMEOUT_MS);
  const signals = [rest.signal, timeout].filter((s): s is AbortSignal => !!s);
  const signal = signals.length > 1 ? AbortSignal.any(signals) : signals[0];
  return fetch(`${cfg.baseUrl}${path}`, { ...rest, signal, redirect: "manual" });
}

/** Headers for OmniRoute. It accepts the key as a Bearer token and as `x-api-key`. */
export const omniHeaders = (cfg: OmniRouteConfig, extra: Record<string, string> = {}): Record<string, string> => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${cfg.apiKey}`,
  "x-api-key": cfg.apiKey,
  ...extra,
});
