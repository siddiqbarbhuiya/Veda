import type { AgentEvent, FileChange } from "./events";
import type { RunnerInput, SandboxHandle, SandboxProvider } from "./sandbox";

type Draft = AgentEvent extends infer E ? (E extends { seq: number } ? Omit<E, "seq"> : never) : never;

/** The events a fake run produces. A `permission` event pauses the script until it is answered. */
export type FakeScript = (input: RunnerInput) => Draft[];

export const defaultScript: FakeScript = (input) => {
  const changes: FileChange[] = [
    { path: "HELLO_FROM_CLAUDE.md", op: "create", content: `# Hello\n\nYou asked: ${input.prompt}\n` },
  ];
  if ("README.md" in input.files) {
    changes.push({ path: "README.md", op: "update", content: `${input.files["README.md"]}\nEdited by the fake agent.\n` });
  }
  return [
    { type: "status", state: "running" },
    { type: "text", text: "This is the fake sandbox. No real model ran." },
    { type: "tool_use", id: "t1", name: "Write", summary: "HELLO_FROM_CLAUDE.md" },
    { type: "tool_result", id: "t1", ok: true, output: "File created" },
    { type: "permission", id: "p1", tool: "Bash", summary: "ls -la" },
    { type: "tool_use", id: "t2", name: "Bash", summary: "ls -la" },
    { type: "tool_result", id: "t2", ok: true, output: "HELLO_FROM_CLAUDE.md" },
    { type: "usage", input_tokens: 120, output_tokens: 40 },
    { type: "changes", changes },
    { type: "done" },
  ];
};

class FakeRun {
  events: AgentEvent[] = [];
  private queue: Draft[];
  private waiting: string | null = null;
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
      if (next.type === "permission") this.waiting = next.id;
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
    if (!allow) this.queue = this.queue.filter((d) => !(d.type === "tool_use" && d.name === "Bash") && !(d.type === "tool_result" && d.id === "t2"));
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
