"use client";

import { useEffect, useState } from "react";

/** "m:ss" for a number of milliseconds. */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

/**
 * A timer for a task. While `running` it counts up each second. After the task ends it keeps the final time,
 * until the next task starts. It is null before the first task.
 */
export function useStopwatch(running: boolean): string | null {
  const [elapsed, setElapsed] = useState<number | null>(null);

  useEffect(() => {
    if (!running) return;
    const start = Date.now();
    const tick = () => setElapsed(Date.now() - start);
    const first = setTimeout(tick, 0);
    const id = setInterval(tick, 1000);
    return () => {
      clearTimeout(first);
      clearInterval(id);
      tick(); // the last value is the final time of the task
    };
  }, [running]);

  return elapsed === null ? null : formatDuration(elapsed);
}
