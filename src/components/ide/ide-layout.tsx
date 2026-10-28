"use client";

import { useCallback, useState } from "react";
import FileTree from "./file-tree";
import EditorPanel from "./editor-panel";
import Toolbar from "./toolbar";
import { DEFAULT_PROJECT_NAME } from "@/hooks/use-file-system";

export default function IdeLayout() {
  const [sidebarW, setSidebarW] = useState(200);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [chatOpen, setChatOpen] = useState(true);

  const startResize = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const startX = e.clientX;
      const startW = sidebarW;
      const move = (ev: MouseEvent) => setSidebarW(Math.min(500, Math.max(120, startW + ev.clientX - startX)));
      const up = () => {
        window.removeEventListener("mousemove", move);
        window.removeEventListener("mouseup", up);
      };
      window.addEventListener("mousemove", move);
      window.addEventListener("mouseup", up);
    },
    [sidebarW]
  );

  return (
    <div className="flex h-full flex-col">
      <Toolbar projectName={DEFAULT_PROJECT_NAME} />
      <div className="flex min-h-0 flex-1">
        {sidebarOpen && (
          <>
            <aside id="sidebar" style={{ width: sidebarW }} className="shrink-0 border-r border-neutral-800 bg-neutral-900">
              <FileTree />
            </aside>
            <div onMouseDown={startResize} className="w-1 shrink-0 cursor-col-resize hover:bg-blue-600" />
          </>
        )}
        <main className="flex min-w-0 flex-1 flex-col">
          <div className="flex h-6 items-center gap-2 border-b border-neutral-800 bg-neutral-900 px-2 text-xs">
            <button onClick={() => setSidebarOpen(!sidebarOpen)}>{sidebarOpen ? "Hide files" : "Show files"}</button>
            <button className="ml-auto" onClick={() => setChatOpen(!chatOpen)}>{chatOpen ? "Hide chat" : "Show chat"}</button>
          </div>
          <div className="min-h-0 flex-1">
            <EditorPanel />
          </div>
          <div
            id="terminal-panel"
            data-panel="terminal"
            className="h-48 shrink-0 border-t border-neutral-800 bg-black p-2 text-xs text-neutral-500"
          >
            Terminal (Task 12)
          </div>
        </main>
        {chatOpen && (
          <aside
            id="chat-panel"
            data-panel="chat"
            className="w-[300px] shrink-0 border-l border-neutral-800 bg-neutral-900 p-2 text-xs text-neutral-500"
          >
            AI Chat (Task 13)
          </aside>
        )}
      </div>
    </div>
  );
}
