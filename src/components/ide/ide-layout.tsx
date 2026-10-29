"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Group,
  Panel,
  useDefaultLayout,
  usePanelRef,
  type LayoutStorage,
  type PanelSize,
} from "react-resizable-panels";
import FileTree from "./file-tree";
import EditorPanel from "./editor-panel";
import Toolbar from "./toolbar";
import TerminalPanel from "./terminal-panel";
import ChatPanel from "./chat-panel";
import { ActivityBar } from "./activity-bar";
import { StatusBar } from "./status-bar";
import { CommandPalette, type PaletteActions } from "./command-palette";
import { ShortcutsDialog } from "./shortcuts-dialog";
import { SmallScreenNotice } from "./small-screen-notice";
import { ResizeHandle } from "./resize-handle";
import { RuntimeProvider, useRuntime } from "./runtime-context";
import { emit } from "./ide-events";
import { useRuntimeStatus } from "./use-runtime-status";
import { useViewportMode } from "./use-viewport-mode";
import { useIdeShortcuts } from "./use-ide-shortcuts";
import { useSignOut } from "./user-menu";
import { setTheme, useTheme } from "@/components/ui/theme";
import { DEFAULT_PROJECT_NAME } from "@/hooks/use-file-system";

export default function IdeLayout() {
  return (
    <RuntimeProvider>
      <IdeLayoutInner />
    </RuntimeProvider>
  );
}

// localStorage can throw (private mode, blocked site data). The layout is then not remembered.
const safeStorage: LayoutStorage = {
  getItem(key) {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  setItem(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* ignore */
    }
  },
};

const HIT_AREA = { fine: 8, coarse: 20 };
const frame = "h-full w-full min-h-0 overflow-hidden";

function IdeLayoutInner() {
  const mode = useViewportMode();
  if (mode === "small") return <SmallScreenNotice />;
  return <Shell tablet={mode === "medium"} />;
}

function Shell({ tablet }: { tablet: boolean }) {
  const router = useRouter();
  const theme = useTheme();
  const { setRuntime } = useRuntime();
  const { status } = useRuntimeStatus();
  const signOut = useSignOut();

  const [paletteOpen, setPaletteOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [topupOpen, setTopupOpen] = useState(false);
  const [open, setOpen] = useState({ sidebar: !tablet, chat: !tablet, terminal: true });

  const sidebarRef = usePanelRef();
  const chatRef = usePanelRef();
  const terminalRef = usePanelRef();

  // Save only after the user resizes, and only on desktop, so a tablet visit never overwrites it.
  const main = useDefaultLayout({
    id: "veda-ide-main",
    panelIds: ["pnl-sidebar", "pnl-main", "pnl-chat"],
    storage: safeStorage,
    onlySaveAfterUserInteractions: true,
  });
  const vertical = useDefaultLayout({
    id: "veda-ide-editor",
    panelIds: ["pnl-editor", "pnl-terminal"],
    storage: safeStorage,
    onlySaveAfterUserInteractions: true,
  });

  const track = (key: "sidebar" | "chat" | "terminal") => (size: PanelSize) => {
    const isOpen = size.asPercentage > 0;
    setOpen((o) => (o[key] === isOpen ? o : { ...o, [key]: isOpen }));
  };

  const toggleSidebar = useCallback(() => {
    const p = sidebarRef.current;
    if (!p) return;
    if (p.isCollapsed()) p.expand();
    else p.collapse();
  }, [sidebarRef]);
  const toggleTerminal = useCallback(() => {
    const p = terminalRef.current;
    if (!p) return;
    if (p.isCollapsed()) p.expand();
    else p.collapse();
  }, [terminalRef]);
  const toggleChat = useCallback(() => {
    const p = chatRef.current;
    if (!p) return;
    if (p.isCollapsed()) p.expand();
    else p.collapse();
  }, [chatRef]);

  const focusChat = useCallback(() => {
    if (chatRef.current?.isCollapsed()) chatRef.current.expand();
    setTimeout(() => emit("veda:focus-chat"), 60);
  }, [chatRef]);

  const chatShortcut = useCallback(() => {
    const inChat = document.getElementById("chat-panel")?.contains(document.activeElement);
    if (chatRef.current?.isCollapsed() || !inChat) focusChat();
    else chatRef.current?.collapse();
  }, [chatRef, focusChat]);

  const run = useCallback(() => {
    if (status !== "booting" && status !== "running") emit("veda:run");
  }, [status]);

  const newFile = useCallback(() => {
    if (sidebarRef.current?.isCollapsed()) sidebarRef.current.expand();
    setTimeout(() => emit("veda:new-file"), 60);
  }, [sidebarRef]);

  const openPalette = useCallback(() => setPaletteOpen(true), []);
  const openShortcuts = useCallback(() => setShortcutsOpen(true), []);

  useIdeShortcuts({
    palette: openPalette,
    run,
    toggleSidebar,
    toggleTerminal,
    chat: chatShortcut,
    newFile,
    shortcuts: openShortcuts,
  });

  const actions: PaletteActions = {
    run,
    newFile,
    toggleSidebar,
    toggleTerminal,
    toggleChat,
    focusChat,
    setRuntime,
    toggleTheme: () => setTheme(theme === "dark" ? "light" : "dark"),
    goDashboard: () => router.push("/dashboard"),
    addCredits: () => setTopupOpen(true),
    showShortcuts: openShortcuts,
    signOut,
  };

  const mainDefault = tablet ? { "pnl-sidebar": 0, "pnl-main": 100, "pnl-chat": 0 } : main.defaultLayout;

  return (
    <div className="flex h-full w-full flex-col bg-app">
      <Toolbar
        projectName={DEFAULT_PROJECT_NAME}
        onOpenPalette={openPalette}
        topupOpen={topupOpen}
        onTopupOpenChange={setTopupOpen}
      />
      <div className="flex min-h-0 flex-1">
        <ActivityBar
          sidebarOpen={open.sidebar}
          chatOpen={open.chat}
          onToggleSidebar={toggleSidebar}
          onToggleChat={toggleChat}
          onOpenPalette={openPalette}
        />
        <Group
          id="veda-ide-main"
          orientation="horizontal"
          className="min-w-0 flex-1"
          defaultLayout={mainDefault}
          onLayoutChanged={tablet ? undefined : main.onLayoutChanged}
          resizeTargetMinimumSize={HIT_AREA}
        >
          <Panel
            id="pnl-sidebar"
            collapsible
            collapsedSize={0}
            defaultSize={tablet ? 0 : 240}
            minSize={180}
            maxSize={420}
            groupResizeBehavior="preserve-pixel-size"
            panelRef={sidebarRef}
            onResize={track("sidebar")}
          >
            <aside id="sidebar" aria-label="Files" inert={!open.sidebar} className={`${frame} bg-panel`}>
              <FileTree />
            </aside>
          </Panel>
          <ResizeHandle id="sep-sidebar" direction="vertical" />
          <Panel id="pnl-main" minSize={320}>
            <main className={`${frame} bg-editor`}>
              <Group
                id="veda-ide-editor"
                orientation="vertical"
                defaultLayout={vertical.defaultLayout}
                onLayoutChanged={tablet ? undefined : vertical.onLayoutChanged}
                resizeTargetMinimumSize={HIT_AREA}
              >
                <Panel id="pnl-editor" minSize={120}>
                  <div className={frame}>
                    <EditorPanel />
                  </div>
                </Panel>
                <ResizeHandle id="sep-terminal" direction="horizontal" />
                <Panel
                  id="pnl-terminal"
                  collapsible
                  collapsedSize={0}
                  defaultSize={240}
                  minSize={120}
                  groupResizeBehavior="preserve-pixel-size"
                  panelRef={terminalRef}
                  onResize={track("terminal")}
                >
                  <div inert={!open.terminal} className={`${frame} bg-panel`}>
                    <TerminalPanel />
                  </div>
                </Panel>
              </Group>
            </main>
          </Panel>
          <ResizeHandle id="sep-chat" direction="vertical" />
          <Panel
            id="pnl-chat"
            collapsible
            collapsedSize={0}
            defaultSize={tablet ? 0 : 360}
            minSize={280}
            maxSize={560}
            groupResizeBehavior="preserve-pixel-size"
            panelRef={chatRef}
            onResize={track("chat")}
          >
            <aside
              id="chat-panel"
              data-panel="chat"
              aria-label="AI Chat"
              inert={!open.chat}
              className={`${frame} bg-panel`}
            >
              <ChatPanel />
            </aside>
          </Panel>
        </Group>
      </div>
      <StatusBar onOpenShortcuts={openShortcuts} />
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} actions={actions} />
      <ShortcutsDialog open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
    </div>
  );
}
