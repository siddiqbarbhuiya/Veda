"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";

/** Window CustomEvent names shared by the IDE shell and the panels. */
export const IDE_EVENTS = {
  run: "veda:run",
  stop: "veda:stop",
  runtimeStatus: "veda:runtime-status",
  chatStatus: "veda:chat-status",
  focusChat: "veda:focus-chat",
  newFile: "veda:new-file",
  balanceChanged: "veda:balance-changed",
  saved: "veda:saved",
  runCommands: "veda:run-commands",
  openDialog: "veda:open-dialog",
} as const;

/** Run commands one after the other in the Node runtime. The terminal panel listens. */
export type RunCommandsDetail = {
  /** Folder in the project. "" is the root. */
  cwd: string;
  commands: Array<{ cmd: string; args: string[] }>;
  /** True when the last command starts a web server that keeps running. */
  serves?: boolean;
};

export type RuntimeStatus = "idle" | "booting" | "running" | "error";

export type IdeEventMap = {
  "veda:run": undefined;
  /** Stop the running program. The terminal panel listens. */
  "veda:stop": undefined;
  "veda:runtime-status": { status: RuntimeStatus; message?: string };
  "veda:chat-status": { model?: string; lastCostPaise?: number };
  "veda:focus-chat": undefined;
  "veda:new-file": undefined;
  /** The wallet balance changed (for example after an AI reply). The toolbar reloads it. */
  "veda:balance-changed": undefined;
  /** The user saved with Ctrl/Cmd+S. The status bar shows "Saved" for a short time. */
  "veda:saved": undefined;
  "veda:run-commands": RunCommandsDetail;
  /** Ask the IDE shell to open a dialog. */
  "veda:open-dialog": { dialog: "templates" | "packages" };
};

export type IdeEventName = keyof IdeEventMap;

export function emit<K extends IdeEventName>(
  name: K,
  ...detail: IdeEventMap[K] extends undefined ? [] : [IdeEventMap[K]]
): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(name, { detail: detail[0] }));
}

export function useIdeEvent<K extends IdeEventName>(
  name: K,
  handler: (detail: IdeEventMap[K]) => void,
): void {
  const ref = useRef(handler);
  useEffect(() => {
    ref.current = handler;
  });
  useEffect(() => {
    const listener = (e: Event) => ref.current((e as CustomEvent<IdeEventMap[K]>).detail);
    window.addEventListener(name, listener);
    return () => window.removeEventListener(name, listener);
  }, [name]);
}

// Last-known status store. A consumer that mounts after the event still gets the last value.
export type RuntimeState = { status: RuntimeStatus; message?: string };
export type ChatState = { model?: string; lastCostPaise?: number };

const IDLE: RuntimeState = { status: "idle" };
let lastRuntime: RuntimeState = IDLE;
let lastChat: ChatState = {};
const subscribers = new Set<() => void>();

function notify() {
  subscribers.forEach((cb) => cb());
}

if (typeof window !== "undefined") {
  window.addEventListener("veda:runtime-status", (e) => {
    const d = (e as CustomEvent<IdeEventMap["veda:runtime-status"]>).detail;
    if (d && d.status) {
      lastRuntime = { status: d.status, message: d.message };
      notify();
    }
  });
  window.addEventListener("veda:chat-status", (e) => {
    const d = (e as CustomEvent<IdeEventMap["veda:chat-status"]>).detail;
    if (d) {
      lastChat = { ...lastChat, ...d };
      notify();
    }
  });
}

function subscribe(cb: () => void) {
  subscribers.add(cb);
  return () => {
    subscribers.delete(cb);
  };
}

/** Last `veda:runtime-status`, replayed for late-mounting consumers. */
export function useRuntimeState(): RuntimeState {
  return useSyncExternalStore(subscribe, () => lastRuntime, () => IDLE);
}

const NO_CHAT: ChatState = {};
/** Last merged `veda:chat-status`, replayed for late-mounting consumers. */
export function useChatState(): ChatState {
  return useSyncExternalStore(subscribe, () => lastChat, () => NO_CHAT);
}
