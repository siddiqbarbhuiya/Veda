/** Providers that Claude Code can use. It speaks the Anthropic Messages format. */
export const AGENT_PROVIDERS = ["anthropic", "openrouter"] as const;
export type AgentProvider = (typeof AGENT_PROVIDERS)[number];

export const isAgentProvider = (p: unknown): p is AgentProvider =>
  typeof p === "string" && (AGENT_PROVIDERS as readonly string[]).includes(p);

/** Anthropic-format upstream for each provider. */
export const UPSTREAM_URL: Record<AgentProvider, string> = {
  anthropic: "https://api.anthropic.com/v1/messages",
  openrouter: "https://openrouter.ai/api/v1/messages",
};

/**
 * Environment for the Claude Code process in the sandbox.
 *
 * - proxy mode (default): the process gets a signed token and the Veda proxy address. It never sees a key.
 * - direct mode (`AGENT_KEY_MODE=direct`, local work only): the process gets the real key. The agent can read it.
 *
 * Claude Code asks for several model names (a main model, a fast model for small jobs). All of them are set to the
 * chosen model, because an OpenRouter account has no model called "haiku".
 */
export function buildRunnerEnv(opts: {
  mode: "proxy" | "direct";
  provider: AgentProvider;
  model: string;
  /** Proxy mode: the signed token. Direct mode: the real key. */
  secret: string;
  /** Proxy mode: public base URL of this server, without a trailing slash. */
  publicUrl?: string;
}): Record<string, string> {
  const env: Record<string, string> = {
    ANTHROPIC_MODEL: opts.model,
    ANTHROPIC_DEFAULT_OPUS_MODEL: opts.model,
    ANTHROPIC_DEFAULT_SONNET_MODEL: opts.model,
    ANTHROPIC_DEFAULT_HAIKU_MODEL: opts.model,
    ANTHROPIC_SMALL_FAST_MODEL: opts.model,
    // A separate config folder, as in the OmniRoute setup guide, so no earlier login can override these settings.
    CLAUDE_CONFIG_DIR: "/home/user/.claude-veda",
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1",
    DISABLE_TELEMETRY: "1",
    DISABLE_AUTOUPDATER: "1",
  };
  if (opts.mode === "proxy") {
    env.ANTHROPIC_BASE_URL = `${(opts.publicUrl ?? "").replace(/\/+$/, "")}/api/agent/llm`;
    env.ANTHROPIC_AUTH_TOKEN = opts.secret;
    env.ANTHROPIC_API_KEY = "";
  } else if (opts.provider === "openrouter") {
    env.ANTHROPIC_BASE_URL = "https://openrouter.ai/api";
    env.ANTHROPIC_AUTH_TOKEN = opts.secret;
    env.ANTHROPIC_API_KEY = "";
  } else {
    env.ANTHROPIC_API_KEY = opts.secret;
  }
  return env;
}
