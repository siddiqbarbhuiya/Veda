import type { SandboxProvider } from "./sandbox";
import { E2BProvider } from "./e2b-provider";
import { FakeSandboxProvider } from "./fake-provider";

// One instance for the whole server process. The fake provider keeps its runs in memory.
// It lives on globalThis: in `next dev` a route module can be loaded again after an edit, and a module-level
// variable would then lose the sandbox of a run that is still going (its permission answers would give 404).
const store = globalThis as unknown as { __vedaSandboxProvider?: SandboxProvider | null };

/**
 * The sandbox provider from the environment.
 * `AGENT_SANDBOX=fake` gives an in-memory fake (local work and demos). `E2B_API_KEY` gives E2B.
 * Null means Claude Code is not set up on this server.
 */
export function getSandboxProvider(): SandboxProvider | null {
  if (store.__vedaSandboxProvider !== undefined) return store.__vedaSandboxProvider;
  if (process.env.AGENT_SANDBOX === "fake") {
    // The fake provider drips events so the UI shows the run as it goes.
    store.__vedaSandboxProvider = new FakeSandboxProvider(undefined, 400);
  } else if (process.env.E2B_API_KEY) {
    store.__vedaSandboxProvider = new E2BProvider();
  } else {
    store.__vedaSandboxProvider = null;
  }
  return store.__vedaSandboxProvider;
}

/** Test helper. */
export function setSandboxProviderForTests(p: SandboxProvider | null | undefined): void {
  store.__vedaSandboxProvider = p;
}
