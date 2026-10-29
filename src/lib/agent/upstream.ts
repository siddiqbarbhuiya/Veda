import { UPSTREAM_URL, type AgentProvider } from "./env";
import { decodeConfig, omniHeaders } from "@/lib/omniroute/config";
import { assertPublicHost } from "@/lib/omniroute/url";

/** Where and how to send one Claude Code request (Anthropic Messages format). */
export type Upstream = {
  url: string;
  headers: Record<string, string>;
  /** Runs before the request. It throws when the address must not be called. */
  guard?: () => Promise<void>;
};

/**
 * The upstream for a provider and the student's saved key.
 * For OmniRoute the saved key is JSON with the student's own address. Null when it cannot be used.
 */
export function upstreamFor(
  provider: AgentProvider,
  storedKey: string,
  extra: Record<string, string>
): Upstream | null {
  if (provider === "omniroute") {
    const cfg = decodeConfig(storedKey);
    if (!cfg) return null;
    return {
      url: `${cfg.baseUrl}/v1/messages`,
      headers: omniHeaders(cfg, extra),
      guard: () => assertPublicHost(cfg.baseUrl),
    };
  }
  const headers: Record<string, string> = { "Content-Type": "application/json", ...extra };
  if (provider === "openrouter") headers.Authorization = `Bearer ${storedKey}`;
  else headers["x-api-key"] = storedKey;
  return { url: UPSTREAM_URL[provider], headers };
}
