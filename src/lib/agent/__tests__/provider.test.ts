// @vitest-environment node
import { describe, it, expect, vi, afterEach } from "vitest";
import { getSandboxProvider, setSandboxProviderForTests } from "../provider";
import { FakeSandboxProvider } from "../fake-provider";
import { LocalProvider } from "../local-provider";

afterEach(() => {
  vi.unstubAllEnvs();
  setSandboxProviderForTests(undefined);
});

describe("getSandboxProvider", () => {
  it("builds a new provider when the setting changes (no stale fake)", () => {
    vi.stubEnv("AGENT_SANDBOX", "fake");
    const fake = getSandboxProvider();
    expect(fake).toBeInstanceOf(FakeSandboxProvider);
    expect(getSandboxProvider()).toBe(fake); // same kind: same instance
    vi.stubEnv("AGENT_SANDBOX", "local");
    expect(getSandboxProvider()).toBeInstanceOf(LocalProvider);
  });
  it("is null when nothing is set up", () => {
    vi.stubEnv("AGENT_SANDBOX", "");
    vi.stubEnv("E2B_API_KEY", "");
    expect(getSandboxProvider()).toBeNull();
  });
});
