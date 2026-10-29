// @vitest-environment node
import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { RUNNER_SOURCE } from "../runner-source";
import { agentLimitsFromEnv, checkAgentLimits } from "../limits";
import { FakeSandboxProvider } from "../fake-provider";
import { projectSlug, sandboxIdOf, newRunId, type SandboxHandle } from "../sandbox";

describe("RUNNER_SOURCE", () => {
  it("is valid JavaScript for Node (syntax check)", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "veda-runner-"));
    const file = path.join(dir, "runner.mjs");
    fs.writeFileSync(file, RUNNER_SOURCE);
    expect(() => execFileSync(process.execPath, ["--check", file], { stdio: "pipe" })).not.toThrow();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("never reads a key variable by name", () => {
    expect(RUNNER_SOURCE).not.toMatch(/ANTHROPIC_AUTH_TOKEN|ANTHROPIC_API_KEY|OPENROUTER/);
  });
});

describe("checkAgentLimits", () => {
  const limits = agentLimitsFromEnv({});
  it("has the default caps", () => {
    expect(limits).toMatchObject({ dailyMinutes: 30, runMaxSeconds: 600, maxTurns: 40, idleSeconds: 600 });
  });
  it("blocks a second active run", () => {
    const r = checkAgentLimits({ activeRuns: 1, minutesToday: 0 }, limits);
    expect(r).toMatchObject({ ok: false, code: "busy" });
  });
  it("blocks over the daily minutes", () => {
    const r = checkAgentLimits({ activeRuns: 0, minutesToday: 30 }, limits);
    expect(r).toMatchObject({ ok: false, code: "daily_limit" });
  });
  it("allows a first run under the cap", () => {
    expect(checkAgentLimits({ activeRuns: 0, minutesToday: 29.9 }, limits)).toEqual({ ok: true });
  });
  it("reads caps from the environment and ignores bad values", () => {
    expect(agentLimitsFromEnv({ AGENT_DAILY_MINUTES: "5", AGENT_RUN_MAX_SECONDS: "abc" })).toMatchObject({
      dailyMinutes: 5,
      runMaxSeconds: 600,
    });
  });
});

describe("run ids and project names", () => {
  it("round-trips the sandbox id and rejects bad ids", () => {
    const id = newRunId("sbx_123");
    expect(sandboxIdOf(id)).toBe("sbx_123");
    for (const bad of ["", "nodot", "a.b.c", "../x.y", "a/b.c", "a.b/c"]) expect(sandboxIdOf(bad)).toBeNull();
  });
  it("makes a safe folder name", () => {
    expect(projectSlug("My App!")).toBe("My-App");
    expect(projectSlug("../../etc")).toBe("etc");
    expect(projectSlug("")).toBe("project");
    expect(projectSlug("मेरा")).toBe("project");
  });
});

describe("FakeSandboxProvider", () => {
  const input = {
    runId: "fake1.r1",
    project: "p",
    prompt: "make a page",
    model: "m",
    newConversation: true,
    files: { "README.md": "# Hi\n" },
    maxTurns: 40,
    maxSeconds: 600,
  };

  it("reuses one sandbox for one student", async () => {
    const p = new FakeSandboxProvider();
    const a = await p.acquire("u1");
    const b = await p.acquire("u1");
    expect(a.id).toBe(b.id);
    expect((await p.acquire("u2")).id).not.toBe(a.id);
  });

  it("pauses at a permission event until it is answered", async () => {
    const p = new FakeSandboxProvider();
    const h: SandboxHandle = await p.acquire("u1");
    await h.startRun(input, {});
    const before = await h.readEvents("fake1.r1", 0);
    expect(before.at(-1)?.type).toBe("permission");
    await h.answerPermission("fake1.r1", "p1", true);
    const after = await h.readEvents("fake1.r1", 0);
    expect(after.at(-1)?.type).toBe("done");
    expect(after.map((e) => e.seq)).toEqual(after.map((_, i) => i));
  });

  it("returns only events from the given seq", async () => {
    const p = new FakeSandboxProvider();
    const h: SandboxHandle = await p.acquire("u1");
    await h.startRun(input, {});
    const rest = await h.readEvents("fake1.r1", 3);
    expect(rest[0].seq).toBe(3);
  });
});
