"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useFileSystem } from "@/hooks/use-file-system";
import { describeChatError, type ChatError } from "@/hooks/use-ai-chat";
import { applyChanges, flattenFiles } from "@/lib/agent/apply-changes";
import { changesOf } from "@/lib/agent/timeline";
import type { AgentEvent } from "@/lib/agent/events";
import type { ComboEntry } from "@/lib/combos";

/** The model, and the models to try when it fails, for one Claude Code run. */
export type AgentChoice = {
  provider: string;
  model: string;
  fallbacks?: ComboEntry[];
  strategy?: "priority" | "round_robin";
};

/** One question from the student and everything Claude Code did about it. */
export type AgentTurn = {
  id: number;
  prompt: string;
  events: AgentEvent[];
  runId: string | null;
  done: boolean;
  /** The project as it was when the run started. Used to find edits made while the agent worked. */
  base: Record<string, string>;
};

export type ChangeDecision = "pending" | "applied" | "rejected" | "conflict";

const MAX_RECONNECTS = 30;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function postStop(runId: string) {
  void fetch("/api/agent/stop", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ run: runId }),
  }).catch(() => {});
}

/** Map an error from the run route to a message and an action. */
export function describeAgentError(status: number, code: string | undefined, message: string | undefined): ChatError {
  switch (code) {
    case "agent_unavailable":
      return { code, message: "Claude Code is not set up on this server yet." };
    case "busy":
    case "daily_limit":
      return { code, message: message || "Claude Code cannot start right now." };
    case "sandbox_unavailable":
      return { code, message: message || "Could not start the sandbox.", action: { kind: "retry" } };
    default:
      return describeChatError(status, code, message);
  }
}

/** Key for an answered permission request: the turn and the request id. */
export const answeredKey = (turnId: number, permissionId: string) => `${turnId}:${permissionId}`;

export function useAgent({ reconnectDelayMs = 1000 }: { reconnectDelayMs?: number } = {}) {
  const { files, projectName, createFile, updateFileContent, deleteFile } = useFileSystem();
  const [turns, setTurns] = useState<AgentTurn[]>([]);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<ChatError | null>(null);
  const [draft, setDraft] = useState<string | null>(null);
  const [decisions, setDecisions] = useState<Record<number, Record<string, ChangeDecision>>>({});
  const [answered, setAnswered] = useState<Set<string>>(new Set());

  const filesRef = useRef(files);
  const turnsRef = useRef<AgentTurn[]>([]);
  const runningRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const genRef = useRef(0);
  const nextTurn = useRef(1);
  const newConversation = useRef(true);
  // Stop was pressed before the server had answered with a run id. It is sent as soon as the id is known.
  const stopWanted = useRef(false);
  const lastSend = useRef<{ prompt: string; choice: AgentChoice } | null>(null);
  const storeRef = useRef({ createFile, updateFileContent, deleteFile });
  useEffect(() => {
    filesRef.current = files;
    storeRef.current = { createFile, updateFileContent, deleteFile };
  });

  const commitTurns = (next: AgentTurn[]) => {
    turnsRef.current = next;
    setTurns(next);
  };

  const patchTurn = (id: number, patch: (t: AgentTurn) => AgentTurn) => {
    commitTurns(turnsRef.current.map((t) => (t.id === id ? patch(t) : t)));
  };

  const send = useCallback(
    async (prompt: string, choice: AgentChoice) => {
      if (runningRef.current || !prompt.trim()) return;
      runningRef.current = true;
      setRunning(true);
      setError(null);
      setDraft(null);
      lastSend.current = { prompt, choice };
      stopWanted.current = false;

      const controller = new AbortController();
      abortRef.current = controller;
      const gen = ++genRef.current;
      const stale = () => gen !== genRef.current;

      const turnId = nextTurn.current++;
      const tree = filesRef.current;
      commitTurns([
        ...turnsRef.current,
        { id: turnId, prompt, events: [], runId: null, done: false, base: flattenFiles(tree) },
      ]);

      let lastSeq = -1;
      let runId: string | null = null;
      let done = false;
      let failed: ChatError | null = null;

      const consume = async (res: Response) => {
        const reader = res.body!.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        const handle = (block: string) => {
          for (const line of block.split("\n")) {
            if (!line.startsWith("data:")) continue;
            let e: AgentEvent;
            try {
              e = JSON.parse(line.slice(5).trim());
            } catch {
              continue;
            }
            // A reconnect may repeat events. The seq makes each one count once.
            if (typeof e.seq !== "number" || e.seq <= lastSeq) continue;
            lastSeq = e.seq;
            if (e.type === "done") done = true;
            if (!stale()) patchTurn(turnId, (t) => ({ ...t, events: [...t.events, e], done: t.done || e.type === "done" }));
          }
        };
        for (;;) {
          const { done: end, value } = await reader.read();
          if (end) break;
          buffer = (buffer + decoder.decode(value, { stream: true })).replace(/\r\n/g, "\n");
          const parts = buffer.split("\n\n");
          buffer = parts.pop() ?? "";
          parts.forEach(handle);
        }
        buffer += decoder.decode();
        if (buffer.trim()) handle(buffer);
      };

      try {
        const res = await fetch("/api/agent/run", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            project: projectName,
            prompt,
            files: tree,
            model: { provider: choice.provider, model: choice.model },
            ...(choice.fallbacks?.length ? { fallbacks: choice.fallbacks } : {}),
            ...(choice.strategy ? { strategy: choice.strategy } : {}),
            newConversation: newConversation.current,
          }),
          signal: controller.signal,
        });
        if (!res.ok || !res.body) {
          let body: { error?: string; code?: string } = {};
          try {
            body = await res.json();
          } catch {
            /* not JSON */
          }
          failed = describeAgentError(res.status, body.code, body.error);
          // The run never started: remove the turn and give the text back.
          if (!stale()) {
            commitTurns(turnsRef.current.filter((t) => t.id !== turnId));
            setDraft(prompt);
          }
          return;
        }
        runId = res.headers.get("X-Agent-Run");
        newConversation.current = false;
        if (!stale()) patchTurn(turnId, (t) => ({ ...t, runId }));
        if (stopWanted.current && runId) postStop(runId);
        await consume(res);

        // The connection ended before "done" (the function limit, or a network drop): ask for the rest.
        let attempts = 0;
        while (!done && !stale() && runId) {
          if (++attempts > MAX_RECONNECTS) {
            failed = { code: "network", message: "Lost the connection to Claude Code. Check your connection." };
            break;
          }
          await sleep(reconnectDelayMs);
          if (stale()) break;
          let again: Response;
          try {
            again = await fetch(`/api/agent/run?run=${encodeURIComponent(runId)}&from=${lastSeq + 1}`, {
              signal: controller.signal,
            });
          } catch (err) {
            if ((err as Error).name === "AbortError") throw err;
            continue;
          }
          if (again.status === 404) {
            failed = { code: "run_lost", message: "The Claude Code session ended. Start a new request." };
            break;
          }
          if (!again.ok || !again.body) continue;
          try {
            await consume(again);
          } catch (err) {
            if ((err as Error).name === "AbortError") throw err;
          }
        }
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          failed = { code: "network", message: "Network problem. Check your connection and try again.", action: { kind: "retry" } };
        }
      } finally {
        if (abortRef.current === controller) abortRef.current = null;
        if (!stale()) {
          if (failed) setError({ ...failed, at: Date.now() });
          patchTurn(turnId, (t) => (t.id === turnId ? { ...t, done: t.done || failed !== null } : t));
          setRunning(false);
          runningRef.current = false;
        }
      }
    },
    // The hook reads files and the store through refs, so only the project name and the delay matter here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [projectName, reconnectDelayMs],
  );

  const stop = useCallback(() => {
    const runId = turnsRef.current.at(-1)?.runId;
    // Ask the sandbox to stop. The stream stays open and ends when the runner says "done".
    // With no run id yet, remember the request: send() posts it when the id arrives.
    if (runId) postStop(runId);
    else stopWanted.current = true;
  }, []);

  const answerPermission = useCallback((turnId: number, permissionId: string, allow: boolean, always = false) => {
    const runId = turnsRef.current.find((t) => t.id === turnId)?.runId;
    if (!runId) return;
    // The key holds the turn too, so the same permission id in another run is not taken as answered.
    const key = answeredKey(turnId, permissionId);
    setAnswered((s) => new Set(s).add(key));
    void fetch("/api/agent/permission", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ run: runId, id: permissionId, allow, always }),
    }).catch(() => {
      // The answer did not arrive: show the buttons again.
      setAnswered((s) => {
        const next = new Set(s);
        next.delete(key);
        return next;
      });
    });
  }, []);

  const setDecision = (turnId: number, paths: string[], value: ChangeDecision) =>
    setDecisions((d) => ({ ...d, [turnId]: { ...d[turnId], ...Object.fromEntries(paths.map((p) => [p, value])) } }));

  /** Write accepted changes to the project. A file the student edited meanwhile becomes a conflict. */
  const accept = useCallback((turnId: number, paths: string[], overwrite = false) => {
    const turn = turnsRef.current.find((t) => t.id === turnId);
    if (!turn) return;
    const result = applyChanges(changesOf(turn.events), new Set(paths), storeRef.current, {
      base: turn.base,
      current: flattenFiles(filesRef.current),
      overwrite: overwrite ? new Set(paths) : undefined,
    });
    setDecision(turnId, result.applied, "applied");
    setDecision(turnId, result.conflicts, "conflict");
    // `skipped` also lists the files that were not asked for (they stay pending). Only an accepted file that
    // could not be applied (unsafe path or no content) is marked rejected, so it does not wait forever.
    setDecision(turnId, result.skipped.filter((path) => paths.includes(path)), "rejected");
  }, []);

  const reject = useCallback((turnId: number, paths: string[]) => setDecision(turnId, paths, "rejected"), []);

  const newChat = useCallback(() => {
    const runId = runningRef.current ? turnsRef.current.at(-1)?.runId : null;
    abortRef.current?.abort();
    abortRef.current = null;
    genRef.current++;
    if (runId) postStop(runId);
    stopWanted.current = false;
    runningRef.current = false;
    newConversation.current = true;
    commitTurns([]);
    setRunning(false);
    setError(null);
    setDraft(null);
    setDecisions({});
    setAnswered(new Set());
  }, []);

  const retry = useCallback(() => {
    const last = lastSend.current;
    if (last) void send(last.prompt, last.choice);
  }, [send]);

  const clearDraft = useCallback(() => setDraft(null), []);

  // Leaving the page ends the connection only. The run goes on in the sandbox and stops by itself.
  useEffect(() => () => abortRef.current?.abort(), []);

  return { turns, running, error, draft, clearDraft, decisions, answered, send, stop, retry, newChat, answerPermission, accept, reject };
}
