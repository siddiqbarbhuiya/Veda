"use client";

import { useEffect, useRef } from "react";

/** Window CustomEvent names shared by the IDE shell and the four panels. */
export const IDE_EVENTS = {
  run: "veda:run",
  runtimeStatus: "veda:runtime-status",
  chatStatus: "veda:chat-status",
  focusChat: "veda:focus-chat",
  newFile: "veda:new-file",
} as const;

export type RuntimeStatus = "idle" | "booting" | "running" | "error";

export type IdeEventMap = {
  "veda:run": undefined;
  "veda:runtime-status": { status: RuntimeStatus; message?: string };
  "veda:chat-status": { model?: string; lastCostPaise?: number };
  "veda:focus-chat": undefined;
  "veda:new-file": undefined;
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
