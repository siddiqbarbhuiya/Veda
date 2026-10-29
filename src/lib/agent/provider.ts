import type { SandboxProvider } from "./sandbox";
import { E2BProvider } from "./e2b-provider";
import { FakeSandboxProvider } from "./fake-provider";

// One instance for the whole server process. The fake provider keeps its runs in memory.
let cached: SandboxProvider | null | undefined;

/**
 * The sandbox provider from the environment.
 * `AGENT_SANDBOX=fake` gives an in-memory fake (local work and demos). `E2B_API_KEY` gives E2B.
 * Null means Claude Code is not set up on this server.
 */
export function getSandboxProvider(): SandboxProvider | null {
  if (cached !== undefined) return cached;
  if (process.env.AGENT_SANDBOX === "fake") {
    // The fake provider drips events so the UI shows the run as it goes.
    cached = new FakeSandboxProvider(undefined, 400);
  } else if (process.env.E2B_API_KEY) {
    cached = new E2BProvider();
  } else {
    cached = null;
  }
  return cached;
}

/** Test helper. */
export function setSandboxProviderForTests(p: SandboxProvider | null | undefined): void {
  cached = p;
}
