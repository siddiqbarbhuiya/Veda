"use client";

import { useEffect, useMemo, useRef } from "react";
import type { ReactNode } from "react";
import { Command } from "cmdk";
import {
  CreditCard,
  FilePlus,
  FileText,
  Keyboard,
  LayoutDashboard,
  LogOut,
  MessageSquare,
  PanelLeft,
  PanelBottom,
  Play,
  Search,
  Sparkles,
  SunMoon,
  Terminal,
} from "lucide-react";
import { Kbd } from "@/components/ui/kbd";
import { useFileSystem, type FileNode } from "@/hooks/use-file-system";

export type PaletteActions = {
  run: () => void;
  newFile: () => void;
  toggleSidebar: () => void;
  toggleTerminal: () => void;
  toggleChat: () => void;
  focusChat: () => void;
  setRuntime: (r: "node" | "python") => void;
  toggleTheme: () => void;
  goDashboard: () => void;
  addCredits: () => void;
  showShortcuts: () => void;
  signOut: () => void;
};

type Cmd = { id: string; label: string; icon: ReactNode; keys?: string[]; run: () => void };

function flatten(nodes: FileNode[], out: FileNode[] = []): FileNode[] {
  for (const n of nodes) {
    if (n.type === "file") out.push(n);
    else if (n.children) flatten(n.children, out);
  }
  return out;
}

const itemClass =
  "flex h-8 cursor-pointer items-center gap-2 rounded-md px-2 text-ui text-fg-2 " +
  "data-[selected=true]:bg-accent-subtle data-[selected=true]:text-fg";
const groupClass =
  "[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-overline " +
  "[&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-[0.08em] " +
  "[&_[cmdk-group-heading]]:text-fg-3";

export function CommandPalette({
  open,
  onClose,
  actions,
}: {
  open: boolean;
  onClose: () => void;
  actions: PaletteActions;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const { files, openFile } = useFileSystem();
  const fileList = useMemo(() => flatten(files), [files]);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const commands: Cmd[] = [
    { id: "run", label: "Run code", icon: <Play size={16} />, keys: ["Ctrl", "Enter"], run: actions.run },
    { id: "new", label: "New file", icon: <FilePlus size={16} />, keys: ["Alt", "N"], run: actions.newFile },
    { id: "sidebar", label: "Toggle sidebar", icon: <PanelLeft size={16} />, keys: ["Ctrl", "B"], run: actions.toggleSidebar },
    { id: "terminal", label: "Toggle terminal", icon: <PanelBottom size={16} />, keys: ["Ctrl", "J"], run: actions.toggleTerminal },
    { id: "chat", label: "Toggle chat", icon: <MessageSquare size={16} />, keys: ["Ctrl", "Shift", "L"], run: actions.toggleChat },
    { id: "focus-chat", label: "Focus chat", icon: <Sparkles size={16} />, run: actions.focusChat },
    { id: "node", label: "Switch runtime to Node.js", icon: <Terminal size={16} />, run: () => actions.setRuntime("node") },
    { id: "python", label: "Switch runtime to Python", icon: <Terminal size={16} />, run: () => actions.setRuntime("python") },
    { id: "theme", label: "Toggle theme", icon: <SunMoon size={16} />, run: actions.toggleTheme },
    { id: "dashboard", label: "Go to dashboard", icon: <LayoutDashboard size={16} />, run: actions.goDashboard },
    { id: "credits", label: "Add credits", icon: <CreditCard size={16} />, run: actions.addCredits },
    { id: "shortcuts", label: "Keyboard shortcuts", icon: <Keyboard size={16} />, keys: ["?"], run: actions.showShortcuts },
    { id: "signout", label: "Sign out", icon: <LogOut size={16} />, run: actions.signOut },
  ];

  const choose = (fn: () => void) => {
    onClose();
    // Let the dialog close and restore focus first, so the action can move focus.
    setTimeout(fn, 0);
  };

  return (
    <dialog
      ref={ref}
      className="veda-dialog"
      aria-label="Command palette"
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      <Command
        key={String(open)}
        label="Command palette"
        loop
        className="veda-dialog-panel w-[min(36rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-line-strong bg-overlay text-fg shadow-e3"
      >
        <div className="flex items-center gap-2 border-b border-line px-3">
          <Search size={16} className="shrink-0 text-fg-3" aria-hidden="true" />
          <Command.Input
            placeholder="Search files and commands..."
            aria-label="Search files and commands"
            className="h-11 w-full bg-transparent text-ui text-fg placeholder:text-fg-3 focus:outline-none"
          />
          <Kbd>Esc</Kbd>
        </div>
        <Command.List className="max-h-[min(24rem,60dvh)] overflow-y-auto p-2">
          <Command.Empty className="px-2 py-6 text-center text-ui text-fg-3">No results found.</Command.Empty>
          {fileList.length > 0 ? (
            <Command.Group heading="Files" className={groupClass}>
              {fileList.map((f) => (
                <Command.Item
                  key={f.path}
                  value={`file ${f.path}`}
                  onSelect={() => choose(() => openFile(f.path))}
                  className={itemClass}
                >
                  <FileText size={16} className="shrink-0" aria-hidden="true" />
                  <span className="truncate">{f.path.replace(/^\//, "")}</span>
                </Command.Item>
              ))}
            </Command.Group>
          ) : null}
          <Command.Group heading="Commands" className={groupClass}>
            {commands.map((c) => (
              <Command.Item key={c.id} value={c.label} onSelect={() => choose(c.run)} className={itemClass}>
                <span className="shrink-0" aria-hidden="true">
                  {c.icon}
                </span>
                <span className="truncate">{c.label}</span>
                {c.keys ? (
                  <span className="ml-auto flex items-center gap-1">
                    {c.keys.map((k) => (
                      <Kbd key={k}>{k}</Kbd>
                    ))}
                  </span>
                ) : null}
              </Command.Item>
            ))}
          </Command.Group>
        </Command.List>
      </Command>
    </dialog>
  );
}
