"use client";

import { Terminal } from "lucide-react";

// Replaced by the full Claude Code tab in a later commit of the same plan.
export default function AgentPanel() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
      <span className="flex size-10 items-center justify-center rounded-full bg-accent-subtle">
        <Terminal size={18} aria-hidden="true" className="text-accent-text" />
      </span>
      <p className="text-ui text-fg-2">Claude Code is coming to this tab.</p>
    </div>
  );
}
