import type { AgentEvent } from "./events";
import type { AgentMode } from "./modes";

/** Everything the runner inside the sandbox needs for one run. */
export type RunnerInput = {
  runId: string;
  /** Project name, already reduced to a safe folder name. */
  project: string;
  prompt: string;
  model: string;
  /** True: start a new Claude Code conversation. False: continue the last one for this project. */
  newConversation: boolean;
  /** The project files from the browser. The sandbox folder is made equal to this before the run. */
  files: Record<string, string>;
  maxTurns: number;
  maxSeconds: number;
  /** How much Claude Code may do without asking. */
  mode: AgentMode;
};

/** One running sandbox that belongs to one student. */
export interface SandboxHandle {
  id: string;
  /** Owner of the sandbox. Routes compare it with the signed-in user. */
  userId: string;
  /** Write the files and the runner, then start Claude Code in the background. Returns when it has started. */
  startRun(input: RunnerInput, env: Record<string, string>): Promise<void>;
  /** Events of one run with `seq >= fromSeq`. An unknown run gives []. */
  readEvents(runId: string, fromSeq: number): Promise<AgentEvent[]>;
  /** Answer a `permission` event. */
  answerPermission(runId: string, permissionId: string, allow: boolean, always?: boolean): Promise<void>;
  /** Ask the run to stop. */
  stop(runId: string): Promise<void>;
  /** Keep the sandbox alive for `ms` more milliseconds. */
  keepAlive(ms: number): Promise<void>;
  /** Destroy the sandbox. */
  kill(): Promise<void>;
}

export interface SandboxProvider {
  /** The student's running sandbox, or a new one. */
  acquire(userId: string): Promise<SandboxHandle>;
  /** An existing sandbox by id. Null when it is gone. */
  connect(sandboxId: string): Promise<SandboxHandle | null>;
}

/** A run id is `<sandboxId>.<random>`. Both parts use only these characters. */
export const RUN_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}\.[A-Za-z0-9_-]{1,64}$/;

export function newRunId(sandboxId: string): string {
  const rand = Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  return `${sandboxId}.${rand}`;
}

/** The sandbox id inside a run id, or null for a malformed id. */
export function sandboxIdOf(runId: string): string | null {
  return RUN_ID_PATTERN.test(runId) ? runId.split(".")[0] : null;
}

/** Reduce a project name to a safe folder name. */
export function projectSlug(name: string): string {
  const s = name
    .normalize("NFKD")
    .replace(/[^A-Za-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return s || "project";
}
