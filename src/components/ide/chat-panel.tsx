"use client";

import { useState } from "react";
import { Sparkles, SquarePen, Terminal } from "lucide-react";
import { Button } from "@/components/ui/button";
import AgentPanel from "./agent-panel";
import ChatTab from "./chat-tab";
import { emit } from "./ide-events";
import { PanelTabs, type PanelTab } from "./panel-tabs";

type TabId = "chat" | "agent";

const TABS: PanelTab<TabId>[] = [
  { id: "chat", label: "Chat", icon: <Sparkles size={14} aria-hidden="true" /> },
  { id: "agent", label: "Claude Code", icon: <Terminal size={14} aria-hidden="true" /> },
];

const TAB_STORAGE_KEY = "veda:ai-tab";

function readTab(): TabId {
  try {
    return localStorage.getItem(TAB_STORAGE_KEY) === "agent" ? "agent" : "chat";
  } catch {
    return "chat";
  }
}

/**
 * The AI side panel. Both tabs stay mounted, so a running reply or agent run
 * keeps going when the student switches tabs.
 */
export default function ChatPanel() {
  const [tab, setTab] = useState<TabId>(readTab);

  const change = (next: TabId) => {
    setTab(next);
    try {
      localStorage.setItem(TAB_STORAGE_KEY, next);
    } catch {
      /* storage blocked: the tab is not remembered */
    }
  };

  return (
    <div className="flex h-full min-h-0 w-full flex-col bg-panel text-fg">
      <div className="flex h-9 shrink-0 items-center justify-between gap-2 border-b border-line pl-2 pr-2">
        <h2 className="sr-only">AI Assistant</h2>
        <PanelTabs tabs={TABS} active={tab} onChange={change} />
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="New chat"
          title="New chat"
          onClick={() => emit("veda:new-chat", { tab })}
        >
          <SquarePen size={14} aria-hidden="true" />
        </Button>
      </div>
      <div
        id="ai-tab-panel-chat"
        role="tabpanel"
        aria-labelledby="ai-tab-chat"
        hidden={tab !== "chat"}
        className="min-h-0 flex-1 data-[hidden=true]:hidden"
      >
        <ChatTab />
      </div>
      <div
        id="ai-tab-panel-agent"
        role="tabpanel"
        aria-labelledby="ai-tab-agent"
        hidden={tab !== "agent"}
        className="min-h-0 flex-1"
      >
        <AgentPanel />
      </div>
    </div>
  );
}
