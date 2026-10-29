// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mocks = vi.hoisted(() => ({
  userId: "u1" as string | null,
  loadUsage: vi.fn(),
  startRunRow: vi.fn(),
  finishRunRow: vi.fn(),
  loadProviderKey: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerClient: async () => ({
    auth: { getUser: async () => ({ data: { user: mocks.userId ? { id: mocks.userId } : null } }) },
  }),
}));
vi.mock("@/lib/agent/admin", () => ({ createAdminClient: () => ({}), loadProviderKey: mocks.loadProviderKey }));
vi.mock("@/lib/agent/runs", () => ({
  loadUsage: mocks.loadUsage,
  startRunRow: mocks.startRunRow,
  finishRunRow: mocks.finishRunRow,
}));

import { POST, GET } from "../run/route";
import { POST as stopPost } from "../stop/route";
import { POST as permissionPost } from "../permission/route";
import { FakeSandboxProvider } from "@/lib/agent/fake-provider";
import { setSandboxProviderForTests } from "@/lib/agent/provider";
import type { SandboxHandle, SandboxProvider } from "@/lib/agent/sandbox";

const SECRET = "ab".repeat(32);
const REAL_KEY = "sk-or-REAL-KEY";

const file = (path: string, content: string) => ({ name: path, path, type: "file", content });

const validBody = {
  project: "My App",
  prompt: "make a page",
  files: [file("README.md", "# Hi\n")],
  model: { provider: "openrouter", model: "meta-llama/llama-3.3-70b-instruct:free" },
};

const post = (body: unknown, url = "http://localhost/api/agent/run") =>
  new Request(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

async function readAll(res: Response) {
  const text = await res.text();
  return text
    .split("\n\n")
    .filter((b) => b.startsWith("data:"))
    .map((b) => JSON.parse(b.slice(5).trim()) as { seq: number; type: string });
}

let started: { env?: Record<string, string>; input?: { files: Record<string, string>; project: string } } = {};
let fake: FakeSandboxProvider;

function spyProvider(): SandboxProvider {
  fake = new FakeSandboxProvider();
  return {
    acquire: async (u) => {
      const h = await fake.acquire(u);
      const orig = h.startRun.bind(h);
      h.startRun = async (input, env) => {
        started = { env, input };
        return orig(input, env);
      };
      return h as SandboxHandle;
    },
    connect: (id) => fake.connect(id),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  started = {};
  mocks.userId = "u1";
  mocks.loadUsage.mockResolvedValue({ activeRuns: 0, minutesToday: 0 });
  mocks.startRunRow.mockResolvedValue(undefined);
  mocks.finishRunRow.mockResolvedValue(undefined);
  mocks.loadProviderKey.mockResolvedValue(REAL_KEY);
  vi.stubEnv("ENCRYPTION_SECRET", SECRET);
  vi.stubEnv("AGENT_PUBLIC_URL", "https://veda.example");
  vi.stubEnv("AGENT_KEY_MODE", "proxy");
  setSandboxProviderForTests(spyProvider());
});
afterEach(() => {
  vi.unstubAllEnvs();
  setSandboxProviderForTests(undefined);
});

describe("POST /api/agent/run", () => {
  it("answers 401 when signed out", async () => {
    mocks.userId = null;
    expect((await POST(post(validBody))).status).toBe(401);
  });

  it("answers 400 for a bad provider, an empty prompt and a non-array tree", async () => {
    const bad = [
      { ...validBody, model: { provider: "openai", model: "gpt-4o" } },
      { ...validBody, prompt: "  " },
      { ...validBody, files: "x" },
      { ...validBody, fallbacks: [{ provider: "openai", model: "x" }] },
    ];
    for (const b of bad) expect((await POST(post(b))).status).toBe(400);
  });

  it("answers 413 for a snapshot over 5 MB", async () => {
    const res = await POST(post({ ...validBody, files: [file("big.txt", "x".repeat(5_000_001))] }));
    expect(res.status).toBe(413);
    expect((await res.json()).code).toBe("payload_too_large");
  });

  it("answers 503 when Claude Code is not set up", async () => {
    setSandboxProviderForTests(null);
    const res = await POST(post(validBody));
    expect(res.status).toBe(503);
    expect((await res.json()).code).toBe("agent_unavailable");
  });

  it("answers 409 when a run is already active and 429 over the daily cap", async () => {
    mocks.loadUsage.mockResolvedValue({ activeRuns: 1, minutesToday: 0 });
    expect((await POST(post(validBody))).status).toBe(409);
    mocks.loadUsage.mockResolvedValue({ activeRuns: 0, minutesToday: 31 });
    expect((await POST(post(validBody))).status).toBe(429);
    expect(fake.acquireCount).toBe(0);
  });

  it("answers 400 no_api_key before any sandbox starts", async () => {
    mocks.loadProviderKey.mockResolvedValue(null);
    const res = await POST(post(validBody));
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("no_api_key");
    expect(fake.acquireCount).toBe(0);
    expect(mocks.startRunRow).not.toHaveBeenCalled();
  });

  it("streams the run, ends with done and records the end once", async () => {
    const res = await POST(post(validBody));
    expect(res.status).toBe(200);
    const runId = res.headers.get("X-Agent-Run")!;
    expect(runId).toMatch(/^fake1\./);
    // Answer the Bash permission so the fake script can finish.
    queueMicrotask(async () => {
      await stopOrAnswer(runId);
    });
    const events = await readAll(res);
    expect(events.at(-1)?.type).toBe("done");
    expect(events.map((e) => e.seq)).toEqual(events.map((_, i) => i));
    expect(mocks.finishRunRow).toHaveBeenCalledTimes(1);
    expect(mocks.finishRunRow.mock.calls[0][1]).toBe(runId);
    // Usage in the fake script: 120 in, 40 out.
    expect(mocks.finishRunRow.mock.calls[0][2]).toMatchObject({ input_tokens: 120, output_tokens: 40, failed: false });
  });

  it("gives the sandbox a token and never the real key", async () => {
    const res = await POST(post(validBody));
    const runId = res.headers.get("X-Agent-Run")!;
    await stopOrAnswer(runId);
    await readAll(res);
    const env = started.env!;
    expect(env.ANTHROPIC_BASE_URL).toBe("https://veda.example/api/agent/llm");
    expect(env.ANTHROPIC_API_KEY).toBe("");
    expect(env.ANTHROPIC_AUTH_TOKEN).not.toBe(REAL_KEY);
    expect(JSON.stringify(started)).not.toContain(REAL_KEY);
    expect(started.input?.project).toBe("My-App");
    expect(started.input?.files).toEqual({ "README.md": "# Hi\n" });
  });
});

// Reconnect and ownership.
async function stopOrAnswer(runId: string) {
  const h = await fake.connect(runId.split(".")[0]);
  await h?.answerPermission(runId, "p1", true);
}

describe("GET /api/agent/run (reconnect)", () => {
  it("returns only events from the requested seq", async () => {
    const res = await POST(post(validBody));
    const runId = res.headers.get("X-Agent-Run")!;
    await stopOrAnswer(runId);
    const all = await readAll(res);
    const url = `http://localhost/api/agent/run?run=${encodeURIComponent(runId)}&from=3`;
    const again = await readAll(await GET(new Request(url)));
    expect(again.map((e) => e.seq)).toEqual(all.slice(3).map((e) => e.seq));
  });

  it("answers 404 for another student's run and for a bad id", async () => {
    const res = await POST(post(validBody));
    const runId = res.headers.get("X-Agent-Run")!;
    await stopOrAnswer(runId);
    await readAll(res);
    mocks.userId = "someone-else";
    const url = (r: string) => `http://localhost/api/agent/run?run=${encodeURIComponent(r)}&from=0`;
    expect((await GET(new Request(url(runId)))).status).toBe(404);
    mocks.userId = "u1";
    expect((await GET(new Request(url("../x.y")))).status).toBe(404);
    expect((await GET(new Request("http://localhost/api/agent/run"))).status).toBe(404);
  });
});

describe("stop and permission routes", () => {
  it("stop: 404 for another student, 200 for the owner", async () => {
    const res = await POST(post(validBody));
    const runId = res.headers.get("X-Agent-Run")!;
    mocks.userId = "someone-else";
    expect((await stopPost(post({ run: runId }))).status).toBe(404);
    mocks.userId = "u1";
    expect((await stopPost(post({ run: runId }))).status).toBe(200);
    await res.text();
  });

  it("permission: validates the body and checks the owner", async () => {
    const res = await POST(post(validBody));
    const runId = res.headers.get("X-Agent-Run")!;
    expect((await permissionPost(post({ run: runId, id: "../x", allow: true }))).status).toBe(400);
    expect((await permissionPost(post({ run: runId, id: "p1", allow: "yes" }))).status).toBe(400);
    mocks.userId = "someone-else";
    expect((await permissionPost(post({ run: runId, id: "p1", allow: true }))).status).toBe(404);
    mocks.userId = "u1";
    expect((await permissionPost(post({ run: runId, id: "p1", allow: true }))).status).toBe(200);
    await readAll(res);
  });
});
