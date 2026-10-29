import { describe, it, expect } from "vitest";
import { AGENT_MODES, DEFAULT_AGENT_MODE, isAgentMode, modeInfo } from "../modes";
import { RUNNER_SOURCE } from "../runner-source";
import { defaultScript } from "../fake-provider";
import { estimateContextTokens } from "../timeline";
import type { AgentEvent } from "../events";

describe("modes", () => {
  it("has four modes and Edit automatically is the default", () => {
    expect(AGENT_MODES.map((m) => m.id)).toEqual(["manual", "edits", "plan", "auto"]);
    expect(DEFAULT_AGENT_MODE).toBe("edits");
    expect(modeInfo("auto").short).toBe("Auto");
  });
  it("accepts only known modes", () => {
    expect(isAgentMode("plan")).toBe(true);
    for (const v of ["", "AUTO", "bypass", undefined, null, 3]) expect(isAgentMode(v)).toBe(false);
  });
});

describe("runner mode mapping", () => {
  it("maps each mode to an Agent SDK permission mode", () => {
    expect(RUNNER_SOURCE).toContain('MODE === "manual" ? "default"');
    expect(RUNNER_SOURCE).toContain('MODE === "plan" ? "plan"');
    expect(RUNNER_SOURCE).toContain('MODE === "auto" ? "bypassPermissions" : "acceptEdits"');
  });
  it("skips the permission prompts only in auto mode", () => {
    expect(RUNNER_SOURCE).toContain('if (MODE === "auto") options.allowDangerouslySkipPermissions = true;');
  });
  it("shows the whole plan, and lets the student allow edits for the run", () => {
    expect(RUNNER_SOURCE).toContain('if (name === "ExitPlanMode") return cut(inp.plan, 4000);');
    expect(RUNNER_SOURCE).toContain("alwaysAllowed.add(toolName)");
  });
});

describe("runner tool limits", () => {
  it("blocks the tools that reach other sessions on the machine", () => {
    expect(RUNNER_SOURCE).toContain('"ListAgents", "SendMessage"');
  });
});

describe("fake scenarios by mode", () => {
  const base = { runId: "f.r", project: "p", prompt: "hello", model: "m", newConversation: true, files: {}, maxTurns: 40, maxSeconds: 600 };
  const perms = (mode: "manual" | "edits" | "plan" | "auto") =>
    defaultScript({ ...base, mode }).flatMap((e) => (e.type === "permission" ? [e.tool] : []));

  it("manual asks for the edit and the command", () => expect(perms("manual")).toEqual(["Write", "Bash"]));
  it("edits asks for the command only", () => expect(perms("edits")).toEqual(["Bash"]));
  it("plan asks to approve the plan first", () => expect(perms("plan")).toEqual(["ExitPlanMode", "Bash"]));
  it("auto asks for nothing", () => expect(perms("auto")).toEqual([]));
  it("/compact is a short run with no changes", () => {
    const types = defaultScript({ ...base, prompt: " /compact ", mode: "edits" }).map((e) => e.type);
    expect(types).toEqual(["status", "text", "usage", "done"]);
  });
});

describe("estimateContextTokens", () => {
  const ev = (e: object, seq: number) => ({ seq, ...e }) as AgentEvent;
  it("counts the request, the messages and the tool calls", () => {
    const empty = estimateContextTokens([]);
    const some = estimateContextTokens([
      { prompt: "x".repeat(400), events: [ev({ type: "text", text: "y".repeat(400) }, 0), ev({ type: "tool_result", id: "1", ok: true, output: "z".repeat(400) }, 1)] },
    ]);
    expect(empty).toBe(0);
    expect(some).toBeGreaterThan(200);
  });
  it("ignores events that are not part of the conversation", () => {
    expect(estimateContextTokens([{ prompt: "", events: [ev({ type: "usage", input_tokens: 99999, output_tokens: 1 }, 0), ev({ type: "done" }, 1)] }])).toBe(0);
  });
});
