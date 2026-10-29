import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { parseEventLines, eventsFrom, type AgentEvent } from "./events";
import { RUNNER_SOURCE } from "./runner-source";
import type { RunnerInput, SandboxHandle, SandboxProvider } from "./sandbox";

const SAFE_ID = /^[A-Za-z0-9_.-]+$/;

/** Base folder for local runs. The runner folder holds `node_modules/@anthropic-ai/claude-agent-sdk`. */
export function localBaseDir(env: Record<string, string | undefined> = process.env): string {
  return env.AGENT_LOCAL_DIR || path.join(os.tmpdir(), "veda-agent");
}

// Only these variables reach Claude Code. The server's own secrets (database, payment, encryption) never do.
const PASS_THROUGH = ["PATH", "Path", "PATHEXT", "SystemRoot", "SYSTEMROOT", "TEMP", "TMP", "ComSpec", "HOME", "USERPROFILE", "APPDATA", "LOCALAPPDATA", "CLAUDE_CODE_GIT_BASH_PATH"];

export function childEnv(extra: Record<string, string>, configDir: string): Record<string, string | undefined> {
  const env: Record<string, string | undefined> = {};
  for (const k of PASS_THROUGH) if (process.env[k] !== undefined) env[k] = process.env[k];
  return { ...env, ...extra, CLAUDE_CONFIG_DIR: configDir };
}

const rel = (id: string) => {
  if (!SAFE_ID.test(id) || id.includes("..")) throw new Error("Bad id");
  return id;
};

class LocalHandle implements SandboxHandle {
  constructor(
    public id: string,
    public userId: string,
    private base: string
  ) {}

  private dir(runId: string) {
    return path.join(this.base, "sandboxes", this.id, "runs", rel(runId));
  }

  async startRun(input: RunnerInput, env: Record<string, string>): Promise<void> {
    const root = path.join(this.base, "sandboxes", this.id);
    const runner = path.join(this.base, "runner");
    const cwd = path.join(root, "projects", input.project);
    const dir = this.dir(input.runId);
    await fs.mkdir(dir, { recursive: true });
    await fs.mkdir(cwd, { recursive: true });
    for (const [p, data] of Object.entries(input.files)) {
      const target = path.join(cwd, ...p.split("/"));
      if (!target.startsWith(cwd + path.sep)) continue; // never write outside the project folder
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target, data);
    }
    await fs.writeFile(path.join(runner, "runner.mjs"), RUNNER_SOURCE);
    await fs.writeFile(path.join(dir, "events.ndjson"), "");
    const payload = { ...input, cwd, sessionFile: path.join(root, "sessions", `${input.project}.json`) };
    await fs.writeFile(path.join(dir, "input.json"), JSON.stringify(payload));
    const log = path.join(dir, "runner.log");
    const child = spawn(process.execPath, [path.join(runner, "runner.mjs"), path.join(dir, "input.json")], {
      cwd: runner,
      env: childEnv(env, path.join(root, "claude-config")) as NodeJS.ProcessEnv,
      detached: false,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const chunks: Buffer[] = [];
    child.stdout.on("data", (b: Buffer) => chunks.push(b));
    child.stderr.on("data", (b: Buffer) => chunks.push(b));
    child.on("exit", (code) => {
      void fs.writeFile(log, Buffer.concat(chunks).toString("utf8").slice(-8000)).catch(() => {});
      // A runner that died before it could write "done" must not leave the tab waiting.
      void (async () => {
        try {
          const events = parseEventLines(await fs.readFile(path.join(dir, "events.ndjson"), "utf8"));
          if (events.some((e) => e.type === "done")) return;
          const seq = events.length;
          const tail = Buffer.concat(chunks).toString("utf8").trim().split("\n").slice(-3).join(" ").slice(0, 300);
          const lines = [
            { seq, type: "error", code: "runner_exited", message: `Claude Code stopped (exit ${code}). ${tail}`.trim() },
            { seq: seq + 1, type: "done" },
          ];
          await fs.appendFile(path.join(dir, "events.ndjson"), lines.map((l) => JSON.stringify(l)).join("\n") + "\n");
        } catch {
          /* the run folder is gone */
        }
      })();
    });
  }

  async readEvents(runId: string, fromSeq: number): Promise<AgentEvent[]> {
    try {
      return eventsFrom(parseEventLines(await fs.readFile(path.join(this.dir(runId), "events.ndjson"), "utf8")), fromSeq);
    } catch {
      return [];
    }
  }

  async answerPermission(runId: string, permissionId: string, allow: boolean, always = false): Promise<void> {
    await fs.writeFile(path.join(this.dir(runId), `perm-${rel(permissionId)}.json`), JSON.stringify({ allow, always }));
  }

  async stop(runId: string): Promise<void> {
    await fs.writeFile(path.join(this.dir(runId), "stop"), "1");
  }

  async keepAlive(): Promise<void> {}

  async kill(): Promise<void> {
    await fs.rm(path.join(this.base, "sandboxes", this.id), { recursive: true, force: true });
  }
}

/**
 * Runs the real Claude Agent SDK as a process on THIS machine, in a temporary folder.
 * For local development only: the agent can run shell commands as the user who started the server.
 * Refuses to start when NODE_ENV is "production".
 *
 * The owner of each sandbox is a file in its folder (`owner`). Nothing is kept in memory, so a dev hot reload or a
 * server restart never loses a sandbox, and a fresh handle always uses the newest code (for example a new runner).
 */
export class LocalProvider implements SandboxProvider {
  constructor(private base: string = localBaseDir()) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("AGENT_SANDBOX=local is for development only and is refused in production.");
    }
  }

  private root(id: string) {
    return path.join(this.base, "sandboxes", rel(id));
  }

  private async ownerOf(id: string): Promise<string | null> {
    try {
      return (await fs.readFile(path.join(this.root(id), "owner"), "utf8")).trim() || null;
    } catch {
      return null;
    }
  }

  async acquire(userId: string): Promise<SandboxHandle> {
    let ids: string[] = [];
    try {
      ids = await fs.readdir(path.join(this.base, "sandboxes"));
    } catch {
      /* no sandbox yet */
    }
    for (const id of ids) {
      if (SAFE_ID.test(id) && (await this.ownerOf(id)) === userId) return new LocalHandle(id, userId, this.base);
    }
    const id = `local${Math.random().toString(36).slice(2, 8)}`;
    await fs.mkdir(this.root(id), { recursive: true });
    await fs.writeFile(path.join(this.root(id), "owner"), userId);
    return new LocalHandle(id, userId, this.base);
  }

  async connect(sandboxId: string): Promise<SandboxHandle | null> {
    if (!SAFE_ID.test(sandboxId) || sandboxId.includes("..")) return null;
    const owner = await this.ownerOf(sandboxId);
    return owner ? new LocalHandle(sandboxId, owner, this.base) : null;
  }
}
