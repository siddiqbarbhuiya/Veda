// @vitest-environment node
import { describe, it, expect } from "vitest";
import { tailRun } from "../tail";
import { buildRunnerEnv } from "../env";
import type { AgentEvent } from "../events";
import type { SandboxHandle } from "../sandbox";

function handleWith(events: AgentEvent[]): SandboxHandle {
  return {
    id: "s1",
    userId: "u1",
    startRun: async () => {},
    readEvents: async (_run, from) => events.filter((e) => e.seq >= from),
    answerPermission: async () => {},
    stop: async () => {},
    keepAlive: async () => {},
    kill: async () => {},
  };
}

const ev = (seq: number, type: string): AgentEvent => ({ seq, type, text: "x" }) as unknown as AgentEvent;
const never = new Date("2999-01-01").getTime();

async function collect(gen: AsyncGenerator<AgentEvent>) {
  const out: AgentEvent[] = [];
  for await (const e of gen) out.push(e);
  return out;
}

describe("tailRun", () => {
  it("yields every event once, in order, and ends at done", async () => {
    const h = handleWith([ev(0, "text"), ev(1, "text"), ev(2, "done")]);
    const out = await collect(tailRun(h, "s1.r", 0, { deadlineAt: never, lostAt: never, sleep: async () => {} }));
    expect(out.map((e) => e.seq)).toEqual([0, 1, 2]);
  });

  it("reconnect with from=last+1 returns no duplicate and no missing event", async () => {
    const all = [ev(0, "text"), ev(1, "text"), ev(2, "text"), ev(3, "done")];
    const h = handleWith(all);
    const first = await collect(tailRun(h, "s1.r", 0, { deadlineAt: never, lostAt: never, sleep: async () => {}, signal: AbortSignal.abort() }));
    expect(first).toEqual([]);
    const part = await collect(tailRun(h, "s1.r", 2, { deadlineAt: never, lostAt: never, sleep: async () => {} }));
    expect(part.map((e) => e.seq)).toEqual([2, 3]);
  });

  it("ends without done at the deadline so the client can reconnect", async () => {
    const h = handleWith([ev(0, "text")]);
    let t = 0;
    const out = await collect(
      tailRun(h, "s1.r", 0, { deadlineAt: 3, lostAt: never, now: () => t++, sleep: async () => {} })
    );
    expect(out.map((e) => e.seq)).toEqual([0, 0, 0].slice(0, out.length));
    expect(out.some((e) => e.type === "done")).toBe(false);
  });

  it("closes a run that never says done with an error and a done event", async () => {
    const h = handleWith([ev(0, "text")]);
    let t = 0;
    const out = await collect(
      tailRun(h, "s1.r", 1, { deadlineAt: never, lostAt: 2, now: () => t++, sleep: async () => {} })
    );
    expect(out.map((e) => e.type)).toEqual(["error", "done"]);
    expect(out[0]).toMatchObject({ seq: 1, code: "run_lost" });
  });
});

describe("buildRunnerEnv", () => {
  it("proxy mode: no key, a token, the Veda address, and one model for every role", () => {
    const env = buildRunnerEnv({ mode: "proxy", provider: "openrouter", model: "a/b:free", secret: "tok", publicUrl: "https://veda.app/" });
    expect(env.ANTHROPIC_BASE_URL).toBe("https://veda.app/api/agent/llm");
    expect(env.ANTHROPIC_AUTH_TOKEN).toBe("tok");
    expect(env.ANTHROPIC_API_KEY).toBe("");
    for (const k of ["ANTHROPIC_MODEL", "ANTHROPIC_DEFAULT_OPUS_MODEL", "ANTHROPIC_DEFAULT_SONNET_MODEL", "ANTHROPIC_DEFAULT_HAIKU_MODEL", "ANTHROPIC_SMALL_FAST_MODEL"]) {
      expect(env[k]).toBe("a/b:free");
    }
  });

  it("direct mode with OpenRouter points at OpenRouter with the key as the token", () => {
    const env = buildRunnerEnv({ mode: "direct", provider: "openrouter", model: "m", secret: "or-key" });
    expect(env.ANTHROPIC_BASE_URL).toBe("https://openrouter.ai/api");
    expect(env.ANTHROPIC_AUTH_TOKEN).toBe("or-key");
    expect(env.ANTHROPIC_API_KEY).toBe("");
  });

  it("direct mode with Anthropic sets the API key only", () => {
    const env = buildRunnerEnv({ mode: "direct", provider: "anthropic", model: "claude-sonnet-5-5", secret: "sk-ant" });
    expect(env.ANTHROPIC_API_KEY).toBe("sk-ant");
    expect(env.ANTHROPIC_BASE_URL).toBeUndefined();
  });
});
