"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
import BottomPanel from "./bottom-panel";
import { TemplateDialog } from "./template-dialog";
import { PackageDialog } from "./package-dialog";
import ChatPanel from "./chat-panel";
import { ActivityBar } from "./activity-bar";
import { StatusBar } from "./status-bar";
import { CommandPalette, type PaletteActions } from "./command-palette";
import { ShortcutsDialog } from "./shortcuts-dialog";
import { ExportDialog } from "./export-dialog";
import { SmallScreenNotice } from "./small-screen-notice";
import { ResizeHandle } from "./resize-handle";
import { RuntimeProvider, useRuntime } from "./runtime-context";
import { emit, useIdeEvent, useRuntimeState } from "./ide-events";
import { useViewportMode } from "./use-viewport-mode";
import { useIdeShortcuts } from "./use-ide-shortcuts";
import { useSignOut } from "./user-menu";
import { setTheme, useTheme } from "@/components/ui/theme";
import { DEFAULT_PROJECT_NAME, useFileSystem } from "@/hooks/use-file-system";

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

const NOTICE_KEY = "veda-small-screen-dismissed";

function readDismissed(): boolean {
  try {
    return sessionStorage.getItem(NOTICE_KEY) === "1";
  } catch {
    return false;
  }
}

// Run after the panel has been laid out, so listeners find a visible, non-inert panel.
function afterPaint(fn: () => void) {
  requestAnimationFrame(() => requestAnimationFrame(fn));
}

function IdeLayoutInner() {
  const mode = useViewportMode();
  const [dismissed, setDismissed] = useState(readDismissed);
  const showNotice = mode === "small" && !dismissed;

  const dismiss = useCallback(() => {
    try {
      sessionStorage.setItem(NOTICE_KEY, "1");
    } catch {
      /* ignore */
    }
    setDismissed(true);
  }, []);

  // The shell is never unmounted, so Monaco, xterm, the shell process and the chat keep their state.
  return (
    <>
      <div inert={showNotice} className="h-full w-full">
        <Shell tablet={mode !== "large"} />
      </div>
      {showNotice ? <SmallScreenNotice onContinue={dismiss} /> : null}
    </>
  );
}

function Shell({ tablet }: { tablet: boolean }) {
  const router = useRouter();
  const theme = useTheme();
  const { setRuntime } = useRuntime();
  const { status } = useRuntimeState();
  const { activeFile, flushNow } = useFileSystem();
  const { signOut, error: signOutError } = useSignOut();

  const [paletteOpen, setPaletteOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [packagesOpen, setPackagesOpen] = useState(false);
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

  // On a narrow window two side panels do not fit. Opening one collapses the other.
  const expandSide = useCallback(
    (which: "sidebar" | "chat") => {
      const own = which === "sidebar" ? sidebarRef.current : chatRef.current;
      const other = which === "sidebar" ? chatRef.current : sidebarRef.current;
      if (tablet && other && !other.isCollapsed()) other.collapse();
      if (own?.isCollapsed()) own.expand();
    },
    [tablet, sidebarRef, chatRef],
  );

  // Move focus out of a panel before it collapses and becomes inert.
  const leavePanel = useCallback((id: string) => {
    const el = document.getElementById(id);
    if (el?.contains(document.activeElement)) {
      document.querySelector<HTMLElement>("#editor-panel textarea, #editor-panel [tabindex]")?.focus();
    }
  }, []);

  const toggleSidebar = useCallback(() => {
    const p = sidebarRef.current;
    if (!p) return;
    if (p.isCollapsed()) expandSide("sidebar");
    else {
      leavePanel("sidebar");
      p.collapse();
    }
  }, [sidebarRef, expandSide, leavePanel]);
  const toggleTerminal = useCallback(() => {
    const p = terminalRef.current;
    if (!p) return;
    if (p.isCollapsed()) p.expand();
    else {
      leavePanel("terminal-panel");
      p.collapse();
    }
  }, [terminalRef, leavePanel]);
  const toggleChat = useCallback(() => {
    const p = chatRef.current;
    if (!p) return;
    if (p.isCollapsed()) expandSide("chat");
    else {
      leavePanel("chat-panel");
      p.collapse();
    }
  }, [chatRef, expandSide, leavePanel]);

  const focusChat = useCallback(() => {
    expandSide("chat");
    afterPaint(() => emit("veda:focus-chat"));
  }, [expandSide]);

  const chatShortcut = useCallback(() => {
    const inChat = document.getElementById("chat-panel")?.contains(document.activeElement);
    if (chatRef.current?.isCollapsed() || !inChat) focusChat();
    else toggleChat();
  }, [chatRef, focusChat, toggleChat]);

  const busy = status === "booting" || status === "running";

  const run = useCallback(() => {
    if (busy || !activeFile) return;
    const t = terminalRef.current;
    if (t?.isCollapsed()) {
      t.expand();
      afterPaint(() => emit("veda:run"));
    } else emit("veda:run");
  }, [busy, activeFile, terminalRef]);

  const stop = useCallback(() => emit("veda:stop"), []);

  const newFile = useCallback(() => {
    expandSide("sidebar");
    afterPaint(() => emit("veda:new-file"));
  }, [expandSide]);

  const save = useCallback(() => {
    void flushNow()
      .then(() => emit("veda:saved"))
      .catch(() => {});
  }, [flushNow]);

  // Crossing the 1024 px breakpoint: collapse the side panels on narrow windows, restore on wide ones.
  const wasTablet = useRef(tablet);
  useEffect(() => {
    if (wasTablet.current === tablet) return;
    wasTablet.current = tablet;
    if (tablet) {
      sidebarRef.current?.collapse();
      chatRef.current?.collapse();
    } else {
      if (sidebarRef.current?.isCollapsed()) sidebarRef.current.expand();
      if (chatRef.current?.isCollapsed()) chatRef.current.expand();
    }
  }, [tablet, sidebarRef, chatRef]);

  useIdeEvent("veda:open-dialog", ({ dialog }) => {
    if (dialog === "templates") setTemplatesOpen(true);
    else setPackagesOpen(true);
  });

  const openPalette = useCallback(() => setPaletteOpen(true), []);
  const openShortcuts = useCallback(() => setShortcutsOpen(true), []);

  useIdeShortcuts({
    palette: openPalette,
    run,
    save,
    toggleSidebar,
    toggleTerminal,
    chat: chatShortcut,
    newFile,
    shortcuts: openShortcuts,
  });

  const actions: PaletteActions = {
    run,
    stopRun: stop,
    newFile,
    toggleSidebar,
    toggleTerminal,
    toggleChat,
    focusChat,
    setRuntime,
    toggleTheme: () => setTheme(theme === "dark" ? "light" : "dark"),
    goDashboard: () => router.push("/dashboard"),
    // Full navigation: Razorpay checkout cannot load under the IDE COEP header.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- full navigation is required (COOP/COEP)
    addCredits: () => window.location.assign("/dashboard?topup=1"),
    exportZip: () => setExportOpen(true),
    newFromTemplate: () => setTemplatesOpen(true),
    addPackage: () => setPackagesOpen(true),
    showShortcuts: openShortcuts,
    signOut,
  };

  const mainDefault = tablet ? { "pnl-sidebar": 0, "pnl-main": 100, "pnl-chat": 0 } : main.defaultLayout;

  return (
    <div className="flex h-full w-full flex-col bg-app">
      <Toolbar
        projectName={DEFAULT_PROJECT_NAME}
        onOpenPalette={openPalette}
        onOpenExport={() => setExportOpen(true)}
        onRun={run}
        onStop={stop}
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
          <ResizeHandle id="sep-sidebar" direction="vertical" label="Resize sidebar" />
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
                <ResizeHandle id="sep-terminal" direction="horizontal" label="Resize terminal" />
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
                    <BottomPanel />
                  </div>
                </Panel>
              </Group>
            </main>
          </Panel>
          <ResizeHandle id="sep-chat" direction="vertical" label="Resize AI chat" />
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
      <ExportDialog open={exportOpen} onClose={() => setExportOpen(false)} />
      <TemplateDialog open={templatesOpen} onClose={() => setTemplatesOpen(false)} />
      <PackageDialog open={packagesOpen} onClose={() => setPackagesOpen(false)} />
      {signOutError ? (
        <p
          role="alert"
          className="fixed bottom-8 right-4 z-40 max-w-sm rounded-lg border border-line-strong bg-overlay px-3 py-2 text-ui text-danger shadow-e2"
        >
          {signOutError}
        </p>
      ) : null}
    </div>
  );
}
