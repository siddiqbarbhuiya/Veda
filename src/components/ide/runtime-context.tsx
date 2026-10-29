"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";

export type Runtime = "node" | "python";

type RuntimeApi = { runtime: Runtime; setRuntime: (r: Runtime) => void };

const RuntimeContext = createContext<RuntimeApi | null>(null);
const STORAGE_KEY = "veda-runtime";

function readStored(): Runtime {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === "python" ? "python" : "node";
  } catch {
    return "node";
  }
}

export function RuntimeProvider({ children }: { children: React.ReactNode }) {
  const [runtime, setRuntimeState] = useState<Runtime>(() => (typeof window === "undefined" ? "node" : readStored()));
  const setRuntime = useCallback((r: Runtime) => {
    setRuntimeState(r);
    try {
      localStorage.setItem(STORAGE_KEY, r);
    } catch {
      /* ignore */
    }
  }, []);
  const value = useMemo(() => ({ runtime, setRuntime }), [runtime, setRuntime]);
  return <RuntimeContext.Provider value={value}>{children}</RuntimeContext.Provider>;
}

export function useRuntime(): RuntimeApi {
  const ctx = useContext(RuntimeContext);
  if (!ctx) throw new Error("useRuntime must be used inside RuntimeProvider");
  return ctx;
}
