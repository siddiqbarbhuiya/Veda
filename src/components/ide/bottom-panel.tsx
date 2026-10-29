"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { useRunningServers } from "@/hooks/use-webcontainer";
import { useIdeEvent } from "./ide-events";
import TerminalPanel from "./terminal-panel";
import PreviewPanel from "./preview-panel";

type Tab = "terminal" | "preview";

const tabClass = (active: boolean) =>
  cn(
    "flex h-full items-center border-b-2 px-1 text-ui font-medium focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring",
    active ? "border-accent text-fg" : "border-transparent text-fg-3 hover:text-fg"
  );

function Tabs({ tab, onChange, live }: { tab: Tab; onChange: (t: Tab) => void; live: boolean }) {
  return (
    <div role="tablist" aria-label="Bottom panel" className="flex h-full items-center gap-3">
      <button type="button" role="tab" aria-selected={tab === "terminal"} className={tabClass(tab === "terminal")} onClick={() => onChange("terminal")}>
        Terminal
      </button>
      <button type="button" role="tab" aria-selected={tab === "preview"} className={tabClass(tab === "preview")} onClick={() => onChange("preview")}>
        Preview
        {live ? <span aria-label="running" className="ml-1.5 size-1.5 rounded-full bg-success" /> : null}
      </button>
    </div>
  );
}

/** Terminal and Preview share the bottom panel. Both stay mounted so the shell and the app keep running. */
export default function BottomPanel() {
  const [tab, setTab] = useState<Tab>("terminal");
  const servers = useRunningServers();
  const had = useRef(false);

  // A server that starts opens the Preview tab.
  useEffect(() => {
    const has = servers.length > 0;
    if (has && !had.current) setTab("preview");
    had.current = has;
  }, [servers.length]);

  // Output of a run or an install shows in the terminal.
  useIdeEvent("veda:run", () => setTab("terminal"));
  useIdeEvent("veda:run-commands", () => setTab("terminal"));

  const tabs = <Tabs tab={tab} onChange={setTab} live={servers.length > 0} />;
  return (
    <>
      <div className={cn("h-full min-h-0", tab !== "terminal" && "hidden")}>
        <TerminalPanel tabs={tabs} />
      </div>
      <div className={cn("h-full min-h-0", tab !== "preview" && "hidden")}>
        <PreviewPanel tabs={tabs} />
      </div>
    </>
  );
}
