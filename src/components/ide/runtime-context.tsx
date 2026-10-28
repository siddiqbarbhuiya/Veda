"use client";

import { createContext, useContext, useMemo, useState } from "react";

export type Runtime = "node" | "python";

type RuntimeApi = { runtime: Runtime; setRuntime: (r: Runtime) => void };

const RuntimeContext = createContext<RuntimeApi | null>(null);

export function RuntimeProvider({ children }: { children: React.ReactNode }) {
  const [runtime, setRuntime] = useState<Runtime>("node");
  const value = useMemo(() => ({ runtime, setRuntime }), [runtime]);
  return <RuntimeContext.Provider value={value}>{children}</RuntimeContext.Provider>;
}

export function useRuntime(): RuntimeApi {
  const ctx = useContext(RuntimeContext);
  if (!ctx) throw new Error("useRuntime must be used inside RuntimeProvider");
  return ctx;
}
