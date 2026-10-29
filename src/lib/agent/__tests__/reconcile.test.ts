// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
import { reconcileRuns } from "../runs";
import { FakeSandboxProvider } from "../fake-provider";
import type { AdminClient } from "../admin";

/** A tiny stand-in for the Supabase query builder used by reconcileRuns and finishRunRow. */
function fakeAdmin(rows: { run_key: string; status: string; created_at: string }[]) {
  const updates: { run_key: string; patch: Record<string, unknown> }[] = [];
  const admin = {
    from: () => {
      const state: { op: "select" | "update"; cols?: string; filters: Record<string, unknown>; patch?: Record<string, unknown> } = {
        op: "select",
        filters: {},
      };
      const chain: Record<string, unknown> = {};
      chain.select = (cols: string) => {
        state.cols = cols;
        return chain;
      };
      chain.update = (patch: Record<string, unknown>) => {
        state.op = "update";
        state.patch = patch;
        return chain;
      };
      chain.eq = (k: string, v: unknown) => {
        state.filters[k] = v;
        return chain;
      };
      chain.gte = () => chain;
      chain.limit = () => chain;
      const finish = () => {
        if (state.op === "update") {
          updates.push({ run_key: String(state.filters.run_key), patch: state.patch! });
          return { data: null, error: null };
        }
        return { data: rows.filter((r) => r.status === (state.filters.status ?? r.status)), error: null };
      };
      chain.maybeSingle = async () => {
        const r = rows.find((x) => x.run_key === state.filters.run_key);
        return { data: r ? { created_at: r.created_at, status: r.status } : null, error: null };
      };
      // `await chain` for list queries and for update(...).eq(...)
      chain.then = (resolve: (v: unknown) => void) => resolve(finish());
      return chain;
    },
  };
  return { admin: admin as unknown as AdminClient, updates };
}

const input = (runId: string) => ({
  runId,
  project: "p",
  prompt: "x",
  model: "m",
  newConversation: true,
  files: {},
  maxTurns: 40,
  maxSeconds: 600,
  mode: "edits" as const,
});

describe("reconcileRuns", () => {
  it("closes a finished run, leaves a running one, and closes a run whose sandbox is gone", async () => {
    const sandboxes = new FakeSandboxProvider();
    const h = await sandboxes.acquire("u1");
    // Run A: let the fake script finish (answer its permission). Run B: stays at the permission request.
    await h.startRun(input(`${h.id}.aaaa`), {});
    await h.answerPermission(`${h.id}.aaaa`, "p1", true);
    await h.startRun(input(`${h.id}.bbbb`), {});
    const old = new Date(Date.now() - 60_000).toISOString();
    const { admin, updates } = fakeAdmin([
      { run_key: `${h.id}.aaaa`, status: "running", created_at: old },
      { run_key: `${h.id}.bbbb`, status: "running", created_at: old },
      { run_key: "gone9.cccc", status: "running", created_at: old },
    ]);

    const closed = await reconcileRuns(admin, sandboxes, "u1");

    expect(closed).toBe(2);
    const byKey = Object.fromEntries(updates.map((u) => [u.run_key, u.patch]));
    expect(byKey[`${h.id}.aaaa`]).toMatchObject({ status: "done", input_tokens: 120, output_tokens: 40 });
    expect(byKey["gone9.cccc"]).toMatchObject({ status: "error" });
    expect(byKey[`${h.id}.bbbb`]).toBeUndefined();
  });

  it("closes a run with no events after two minutes, but not a brand new one", async () => {
    const sandboxes = new FakeSandboxProvider();
    const h = await sandboxes.acquire("u1");
    const { admin, updates } = fakeAdmin([
      { run_key: `${h.id}.dead`, status: "running", created_at: new Date(Date.now() - 5 * 60_000).toISOString() },
      { run_key: `${h.id}.new`, status: "running", created_at: new Date(Date.now() - 20_000).toISOString() },
    ]);
    expect(await reconcileRuns(admin, sandboxes, "u1")).toBe(1);
    expect(updates.map((u) => u.run_key)).toEqual([`${h.id}.dead`]);
    expect(updates[0].patch).toMatchObject({ status: "error" });
  });

  it("returns 0 when the query fails", async () => {
    const admin = {
      from: () => {
        const chain: Record<string, unknown> = {};
        for (const k of ["select", "eq", "gte", "limit"]) chain[k] = () => chain;
        chain.then = (resolve: (v: unknown) => void) => resolve({ data: null, error: new Error("db down") });
        return chain;
      },
    } as unknown as AdminClient;
    expect(await reconcileRuns(admin, new FakeSandboxProvider(), "u1")).toBe(0);
  });

  it("skips a run when its events cannot be read", async () => {
    const sandboxes = new FakeSandboxProvider();
    const h = await sandboxes.acquire("u1");
    vi.spyOn(h, "readEvents").mockRejectedValue(new Error("network"));
    const { admin, updates } = fakeAdmin([{ run_key: `${h.id}.aaaa`, status: "running", created_at: new Date().toISOString() }]);
    expect(await reconcileRuns(admin, sandboxes, "u1")).toBe(0);
    expect(updates).toEqual([]);
  });
});
