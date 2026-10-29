import { Sandbox } from "e2b";
import { parseEventLines, eventsFrom, type AgentEvent } from "./events";
import { RUNNER_SOURCE } from "./runner-source";
import type { RunnerInput, SandboxHandle, SandboxProvider } from "./sandbox";
import { agentLimitsFromEnv } from "./limits";

const HOME = "/home/user";
const SAFE_ID = /^[A-Za-z0-9_.-]+$/;

const templateName = () => process.env.E2B_TEMPLATE || "veda-claude-code";

function runDir(runId: string): string {
  if (!SAFE_ID.test(runId) || runId.includes("..")) throw new Error("Bad run id");
  return `${HOME}/.veda/${runId}`;
}

/** A hung command or file call must not block the route for long. */
const REQUEST_TIMEOUT_MS = 30_000;

class E2BHandle implements SandboxHandle {
  constructor(
    private sbx: Sandbox,
    public userId: string
  ) {}

  get id() {
    return this.sbx.sandboxId;
  }

  async startRun(input: RunnerInput, env: Record<string, string>): Promise<void> {
    const dir = runDir(input.runId);
    const cwd = `${HOME}/projects/${input.project}`;
    const entries = Object.entries(input.files).map(([p, data]) => ({ path: `${cwd}/${p}`, data }));
    if (entries.length > 0) await this.sbx.files.writeFiles(entries, { requestTimeoutMs: 120_000 });
    await this.sbx.files.write(`${HOME}/runner/runner.mjs`, RUNNER_SOURCE);
    const payload = {
      ...input,
      cwd,
      sessionFile: `${HOME}/.veda/sessions/${input.project}.json`,
    };
    await this.sbx.files.write(`${dir}/input.json`, JSON.stringify(payload));
    await this.sbx.files.write(`${dir}/events.ndjson`, "");
    const idleMs = agentLimitsFromEnv().idleSeconds * 1000;
    await this.sbx.setTimeout(input.maxSeconds * 1000 + idleMs);
    // timeoutMs 0: a background command must not be cut off by the default 60 second command timeout.
    await this.sbx.commands.run(`node ${HOME}/runner/runner.mjs ${dir}/input.json`, {
      background: true,
      cwd: `${HOME}/runner`,
      envs: env,
      timeoutMs: 0,
    });
  }

  async readEvents(runId: string, fromSeq: number): Promise<AgentEvent[]> {
    try {
      const text = await this.sbx.files.read(`${runDir(runId)}/events.ndjson`, { requestTimeoutMs: REQUEST_TIMEOUT_MS });
      return eventsFrom(parseEventLines(text), fromSeq);
    } catch (err) {
      if ((err as { name?: string })?.name === "NotFoundError" || (err as { name?: string })?.name === "FileNotFoundError") return [];
      throw err;
    }
  }

  async answerPermission(runId: string, permissionId: string, allow: boolean, always = false): Promise<void> {
    if (!SAFE_ID.test(permissionId)) throw new Error("Bad permission id");
    await this.sbx.files.write(`${runDir(runId)}/perm-${permissionId}.json`, JSON.stringify({ allow, always }));
  }

  async stop(runId: string): Promise<void> {
    await this.sbx.files.write(`${runDir(runId)}/stop`, "1");
  }

  async keepAlive(ms: number): Promise<void> {
    await this.sbx.setTimeout(ms);
  }

  async kill(): Promise<void> {
    await this.sbx.kill();
  }
}

/**
 * E2B sandboxes. One running sandbox for each student, found by its metadata.
 * The template must have Node and `@anthropic-ai/claude-agent-sdk` installed in `/home/user/runner`.
 */
export class E2BProvider implements SandboxProvider {
  async acquire(userId: string): Promise<SandboxHandle> {
    const idleMs = agentLimitsFromEnv().idleSeconds * 1000;
    const page = Sandbox.list({ query: { metadata: { userId }, state: ["running"] } });
    const [existing] = await page.nextItems();
    if (existing) {
      try {
        const sbx = await Sandbox.connect(existing.sandboxId);
        return new E2BHandle(sbx, userId);
      } catch {
        /* the sandbox ended while we looked: create a new one */
      }
    }
    const sbx = await Sandbox.create(templateName(), { timeoutMs: idleMs, metadata: { userId } });
    return new E2BHandle(sbx, userId);
  }

  async connect(sandboxId: string): Promise<SandboxHandle | null> {
    try {
      const sbx = await Sandbox.connect(sandboxId);
      const info = await sbx.getInfo();
      const userId = info.metadata?.userId;
      return userId ? new E2BHandle(sbx, userId) : null;
    } catch {
      return null;
    }
  }
}
