/** Safety caps for Claude Code runs. They protect Veda while pricing is not decided (docs/product/pricing-later.md). */
export type AgentLimits = {
  /** Minutes of sandbox time for each student each day. */
  dailyMinutes: number;
  /** A run is stopped after this many seconds. */
  runMaxSeconds: number;
  /** Agent turns for each run. */
  maxTurns: number;
  /** A sandbox with no run is destroyed after this many seconds. */
  idleSeconds: number;
};

const num = (v: string | undefined, fallback: number) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

export function agentLimitsFromEnv(env: Record<string, string | undefined> = process.env): AgentLimits {
  return {
    dailyMinutes: num(env.AGENT_DAILY_MINUTES, 30),
    runMaxSeconds: num(env.AGENT_RUN_MAX_SECONDS, 600),
    maxTurns: 40,
    idleSeconds: 600,
  };
}

export type LimitResult = { ok: true } | { ok: false; code: "busy" | "daily_limit"; message: string };

/** One run at a time for each student, and a daily cap on sandbox minutes. */
export function checkAgentLimits(
  used: { activeRuns: number; minutesToday: number },
  limits: AgentLimits
): LimitResult {
  if (used.activeRuns > 0) {
    return { ok: false, code: "busy", message: "Claude Code is still working on your last request. Wait for it to finish, or stop it." };
  }
  if (used.minutesToday >= limits.dailyMinutes) {
    return {
      ok: false,
      code: "daily_limit",
      message: `You used your ${limits.dailyMinutes} minutes of Claude Code for today. Try again tomorrow.`,
    };
  }
  return { ok: true };
}
