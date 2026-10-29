// @vitest-environment node
import { describe, it, expect, vi, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { LocalProvider, childEnv } from "../local-provider";

afterEach(() => vi.unstubAllEnvs());

describe("childEnv", () => {
  it("passes the system basics and the given variables, but not the server's secrets", () => {
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "secret-1");
    vi.stubEnv("ENCRYPTION_SECRET", "secret-2");
    vi.stubEnv("RAZORPAY_KEY_SECRET", "secret-3");
    vi.stubEnv("PATH", "/bin");
    const env = childEnv({ ANTHROPIC_AUTH_TOKEN: "tok" }, "/cfg");
    expect(env.PATH ?? env.Path).toBeTruthy();
    expect(env.ANTHROPIC_AUTH_TOKEN).toBe("tok");
    expect(env.CLAUDE_CONFIG_DIR).toBe("/cfg");
    expect(JSON.stringify(env)).not.toMatch(/secret-[123]/);
  });
});

describe("LocalProvider", () => {
  it("refuses to start in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(() => new LocalProvider()).toThrow(/development only/);
  });

  it("gives one sandbox to a student and finds it by id", async () => {
    const p = new LocalProvider(fs.mkdtempSync(path.join(os.tmpdir(), "veda-lp-")));
    const a = await p.acquire("u1");
    expect((await p.acquire("u1")).id).toBe(a.id);
    expect((await p.connect(a.id))?.userId).toBe("u1");
    expect(await p.connect("nope")).toBeNull();
  });

  it("writes project files inside the folder only, and a runner that dies still ends the run", async () => {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), "veda-lp-"));
    fs.mkdirSync(path.join(base, "runner"), { recursive: true }); // no SDK installed: the runner fails at import
    const p = new LocalProvider(base);
    const h = await p.acquire("u9");
    await h.startRun(
      { runId: `${h.id}.r1`, project: "proj", prompt: "x", model: "m", newConversation: true, files: { "a.txt": "A", "../escape.txt": "X" }, maxTurns: 1, maxSeconds: 30, mode: "edits" },
      {}
    );
    const proj = path.join(base, "sandboxes", h.id, "projects", "proj");
    expect(fs.readFileSync(path.join(proj, "a.txt"), "utf8")).toBe("A");
    expect(fs.existsSync(path.join(base, "sandboxes", h.id, "projects", "escape.txt"))).toBe(false);
    let events: { type: string }[] = [];
    for (let i = 0; i < 50 && !events.some((e) => e.type === "done"); i++) {
      await new Promise((r) => setTimeout(r, 200));
      events = await h.readEvents(`${h.id}.r1`, 0);
    }
    expect(events.map((e) => e.type)).toEqual(["error", "done"]);
    await h.kill();
  });
});
