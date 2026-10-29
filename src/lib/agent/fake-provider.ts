import type { AgentEvent, FileChange } from "./events";
import type { RunnerInput, SandboxHandle, SandboxProvider } from "./sandbox";

type Draft = AgentEvent extends infer E ? (E extends { seq: number } ? Omit<E, "seq"> : never) : never;

/** The events a fake run produces. A `permission` event pauses the script until it is answered. */
export type FakeScript = (input: RunnerInput) => Draft[];

const basicScript: FakeScript = (input) => {
  const changes: FileChange[] = [
    { path: "HELLO_FROM_CLAUDE.md", op: "create", content: `# Hello\n\nYou asked: ${input.prompt}\n` },
  ];
  if ("README.md" in input.files) {
    changes.push({ path: "README.md", op: "update", content: `${input.files["README.md"]}\nEdited by the fake agent.\n` });
  }
  // The mode decides which requests the student sees, like the real engine:
  //   plan: a plan to approve first   manual: also asks before the edit   auto: asks for nothing
  const steps: Draft[] = [{ type: "status", state: "running" }];
  if (input.mode === "plan") {
    steps.push(
      { type: "text", text: "Here is my plan." },
      { type: "permission", id: "plan1", tool: "ExitPlanMode", summary: "1. Create HELLO_FROM_CLAUDE.md\n2. List the files with ls" },
      { type: "text", text: "Plan approved. Working on it." }
    );
  }
  steps.push({ type: "text", text: "This is the fake sandbox. No real model ran." });
  if (input.mode === "manual") steps.push({ type: "permission", id: "pw", tool: "Write", summary: "HELLO_FROM_CLAUDE.md" });
  steps.push(
    { type: "tool_use", id: "t1", name: "Write", summary: "HELLO_FROM_CLAUDE.md" },
    { type: "tool_result", id: "t1", ok: true, output: "File created" }
  );
  if (input.mode !== "auto") steps.push({ type: "permission", id: "p1", tool: "Bash", summary: "ls -la" });
  steps.push(
    { type: "tool_use", id: "t2", name: "Bash", summary: "ls -la" },
    { type: "tool_result", id: "t2", ok: true, output: "HELLO_FROM_CLAUDE.md" },
    { type: "usage", input_tokens: 120, output_tokens: 40 },
    { type: "changes", changes },
    { type: "done" }
  );
  return steps;
};

/**
 * Scenarios for local testing. The prompt picks one by a keyword; any other prompt gives the basic run.
 * - "nochange": the agent answers and changes no file.
 * - "fail": the agent stops with an error.
 * - "many": five changes in different folders, including a delete.
 * - "long": a long run with many steps (to test a dropped connection and a reconnect).
 */
export const defaultScript: FakeScript = (input) => {
  const prompt = input.prompt.toLowerCase();
  if (prompt.trim() === "/compact") {
    return [
      { type: "status", state: "running" },
      { type: "text", text: "Conversation compacted. The earlier steps were summarized." },
      { type: "usage", input_tokens: 60, output_tokens: 25 },
      { type: "done" },
    ];
  }
  if (prompt.includes("nochange")) {
    return [
      { type: "status", state: "running" },
      { type: "text", text: "I looked at the project. Nothing needs to change." },
      { type: "usage", input_tokens: 30, output_tokens: 12 },
      { type: "done" },
    ];
  }
  if (prompt.includes("fail")) {
    return [
      { type: "status", state: "running" },
      { type: "text", text: "I will try to fix this." },
      { type: "tool_use", id: "t1", name: "Bash", summary: "npm test" },
      { type: "tool_result", id: "t1", ok: false, output: "Error: simulated failure" },
      { type: "error", code: "error_max_turns", message: "Claude Code stopped: it reached the turn limit." },
      { type: "done" },
    ];
  }
  if (prompt.includes("many")) {
    const changes: FileChange[] = [
      { path: "src/app.js", op: "create", content: "export const app = () => 'hello';\n" },
      { path: "src/util/math.js", op: "create", content: "export const add = (a, b) => a + b;\n" },
      { path: "tests/app.test.js", op: "create", content: "import { app } from '../src/app.js';\nconsole.assert(app() === 'hello');\n" },
      { path: "index.js", op: "update", content: "import { app } from './src/app.js';\nconsole.log(app());\n" },
    ];
    if ("README.md" in input.files) changes.push({ path: "README.md", op: "delete" });
    return [
      { type: "status", state: "running" },
      { type: "text", text: "I split the code into modules and added a test." },
      { type: "tool_use", id: "t1", name: "Write", summary: "src/app.js" },
      { type: "tool_result", id: "t1", ok: true, output: "File created" },
      { type: "tool_use", id: "t2", name: "Edit", summary: "index.js" },
      { type: "tool_result", id: "t2", ok: true, output: "File edited" },
      { type: "usage", input_tokens: 400, output_tokens: 150 },
      { type: "changes", changes },
      { type: "done" },
    ];
  }
  if (prompt.includes("long")) {
    const steps: Draft[] = [{ type: "status", state: "running" }];
    for (let i = 1; i <= 14; i++) steps.push({ type: "text", text: `Step ${i} of 14.` });
    steps.push({ type: "usage", input_tokens: 200, output_tokens: 70 }, { type: "done" });
    return steps;
  }
  return basicScript(input);
};

class FakeRun {
  events: AgentEvent[] = [];
  private queue: Draft[];
  private waiting: string | null = null;
  private waitingTool = "";
  stopped = false;

  constructor(
    script: Draft[],
    private delayMs: number
  ) {
    this.queue = [...script];
    this.pump();
  }

  private push(d: Draft) {
    this.events.push({ ...d, seq: this.events.length } as AgentEvent);
  }

  private pump() {
    const step = () => {
      if (this.stopped) {
        if (!this.events.some((e) => e.type === "done")) this.push({ type: "done" });
        return;
      }
      if (this.waiting) return;
      const next = this.queue.shift();
      if (!next) return;
      this.push(next);
      if (next.type === "permission") {
        this.waiting = next.id;
        this.waitingTool = next.tool;
      }
      if (next.type === "done") return;
      if (this.delayMs > 0) setTimeout(step, this.delayMs);
      else step();
    };
    if (this.delayMs > 0) setTimeout(step, this.delayMs);
    else step();
  }

  stop() {
    this.stopped = true;
    this.waiting = null;
    if (!this.events.some((e) => e.type === "done")) this.push({ type: "done" });
  }

  answer(id: string, allow: boolean) {
    if (this.waiting !== id) return;
    this.waiting = null;
    if (!allow) {
      if (this.waitingTool === "ExitPlanMode") {
        // A plan that is not approved ends the run with no changes.
        this.queue = [
          { type: "text", text: "Plan not approved. No changes were made." },
          { type: "usage", input_tokens: 80, output_tokens: 30 },
          { type: "done" },
        ];
      } else {
        // A denied tool does not run: drop its call and its result.
        const ids = new Set(this.queue.filter((d) => d.type === "tool_use" && d.name === this.waitingTool).map((d) => (d as { id: string }).id));
        this.queue = this.queue.filter(
          (d) => !(d.type === "tool_use" && ids.has(d.id)) && !(d.type === "tool_result" && ids.has(d.id))
        );
      }
    }
    this.pump();
  }
}

class FakeHandle implements SandboxHandle {
  runs = new Map<string, FakeRun>();
  killed = false;
  constructor(
    public id: string,
    public userId: string,
    private script: FakeScript,
    private delayMs: number
  ) {}

  async startRun(input: RunnerInput, env?: Record<string, string>) {
    void env; // the fake runs no process, so it needs no environment
    this.runs.set(input.runId, new FakeRun(this.script(input), this.delayMs));
  }
  async readEvents(runId: string, fromSeq: number) {
    return (this.runs.get(runId)?.events ?? []).filter((e) => e.seq >= fromSeq);
  }
  async answerPermission(runId: string, permissionId: string, allow: boolean) {
    this.runs.get(runId)?.answer(permissionId, allow);
  }
  async stop(runId: string) {
    this.runs.get(runId)?.stop();
  }
  async keepAlive() {}
  async kill() {
    this.killed = true;
  }
}

/** In-memory sandbox for tests and for local work without an E2B account (`AGENT_SANDBOX=fake`). */
export class FakeSandboxProvider implements SandboxProvider {
  private byUser = new Map<string, FakeHandle>();
  private byId = new Map<string, FakeHandle>();
  acquireCount = 0;

  constructor(
    private script: FakeScript = defaultScript,
    private delayMs = 0
  ) {}

  async acquire(userId: string) {
    this.acquireCount++;
    let h = this.byUser.get(userId);
    if (!h || h.killed) {
      h = new FakeHandle(`fake${this.byId.size + 1}`, userId, this.script, this.delayMs);
      this.byUser.set(userId, h);
      this.byId.set(h.id, h);
    }
    return h;
  }

  async connect(sandboxId: string) {
    const h = this.byId.get(sandboxId);
    return h && !h.killed ? h : null;
  }
}
