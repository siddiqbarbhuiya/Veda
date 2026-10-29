import type { SandboxProvider } from "./sandbox";
import { E2BProvider } from "./e2b-provider";
import { FakeSandboxProvider } from "./fake-provider";
import { LocalProvider } from "./local-provider";

// One instance for the whole server process. The fake provider keeps its runs in memory.
// It lives on globalThis: in `next dev` a route module can be loaded again after an edit, and a module-level
// variable would then lose the sandbox of a run that is still going (its permission answers would give 404).
// The kind is saved with it, so a changed setting (AGENT_SANDBOX or E2B_API_KEY) builds a new provider.
const store = globalThis as unknown as { __vedaSandbox?: { kind: string; provider: SandboxProvider | null } };

function kindFromEnv(): "local" | "fake" | "e2b" | "none" {
  if (process.env.AGENT_SANDBOX === "local") return "local";
  if (process.env.AGENT_SANDBOX === "fake") return "fake";
  return process.env.E2B_API_KEY ? "e2b" : "none";
}

/**
 * The sandbox provider from the environment.
 * `AGENT_SANDBOX=local` runs the real Agent SDK on this machine (development only).
 * `AGENT_SANDBOX=fake` gives an in-memory fake (UI demos, no model). `E2B_API_KEY` gives E2B.
 * Null means Claude Code is not set up on this server.
 */
export function getSandboxProvider(): SandboxProvider | null {
  const kind = kindFromEnv();
  if (store.__vedaSandbox && store.__vedaSandbox.kind === kind) return store.__vedaSandbox.provider;
  const provider =
    kind === "local"
      ? new LocalProvider()
      : kind === "fake"
        ? new FakeSandboxProvider(undefined, 400) // drips events so the UI shows the run as it goes
        : kind === "e2b"
          ? new E2BProvider()
          : null;
  store.__vedaSandbox = { kind, provider };
  return provider;
}

/** Test helper. `undefined` forgets the provider, so the next call builds it from the environment. */
export function setSandboxProviderForTests(p: SandboxProvider | null | undefined): void {
  store.__vedaSandbox = p === undefined ? undefined : { kind: kindFromEnv(), provider: p };
}
