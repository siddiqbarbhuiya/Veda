"use client";

import { useState } from "react";
import { useIdeEvent, type RuntimeStatus } from "./ide-events";

export type RuntimeState = { status: RuntimeStatus; message?: string };

/** Latest `veda:runtime-status` detail. Idle until the terminal reports. */
export function useRuntimeStatus(): RuntimeState {
  const [state, setState] = useState<RuntimeState>({ status: "idle" });
  useIdeEvent("veda:runtime-status", (d) => {
    if (d && d.status) setState({ status: d.status, message: d.message });
  });
  return state;
}
