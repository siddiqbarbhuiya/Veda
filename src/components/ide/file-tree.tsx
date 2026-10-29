"use client";

import { useCallback, useMemo, useState } from "react";
import { ChevronRight, FilePlus, FolderPlus } from "lucide-react";
import { useFileSystem, findNode, type FileNode } from "@/hooks/use-file-system";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { cn } from "@/lib/cn";
import { useIdeEvent } from "./ide-events";
import { FileIcon } from "./file-icon";
import { FILE_OPENED_EVENT } from "./editor-tabs";
import { INDENT, InlineNameInput, ROW_PAD, TreeContextMenu, type MenuState } from "./file-tree-parts";

type Inline =
  | { mode: "new-file" | "new-folder"; baseDir: string }
  | { mode: "rename"; path: string }
  | null;

type Row = { node: FileNode; depth: number; parent: string | null };

function dirOf(path: string) {
  return path.includes("/") ? path.slice(0, path.lastIndexOf("/") + 1) : "";
}

const baseDir = (n: FileNode | null) => (!n ? "" : n.type === "directory" ? n.path + "/" : dirOf(n.path));

export default function FileTree() {
  const { files, activeFile, openFile, createFile, deleteFile } = useFileSystem();
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const [focused, setFocused] = useState<string | null>(null);
  const [inline, setInline] = useState<Inline>(null);
  const [toDelete, setToDelete] = useState<FileNode | null>(null);

  const closeMenu = useCallback(() => setMenu(null), []);
  const open = (path: string) => {
    openFile(path);
    window.dispatchEvent(new CustomEvent(FILE_OPENED_EVENT, { detail: path }));
  };

  const visible = useMemo(() => {
    const out: Row[] = [];
    const walk = (nodes: FileNode[], depth: number, parent: string | null) => {
      for (const n of nodes) {
        out.push({ node: n, depth, parent });
        if (n.type === "directory" && !collapsed.has(n.path)) walk(n.children ?? [], depth + 1, n.path);
      }
    };
    walk(files, 0, null);
    return out;
  }, [files, collapsed]);

  const activePath = activeFile?.path ?? null;
  const rovingPath = visible.some((r) => r.node.path === focused)
    ? focused
    : visible.some((r) => r.node.path === activePath)
      ? activePath
      : (visible[0]?.node.path ?? null);

  const focusRow = (path: string) => {
    setFocused(path);
    const els = document.querySelectorAll<HTMLElement>("#file-tree [role='treeitem']");
    for (const el of els) if (el.dataset.path === path) el.focus();
  };

  const setOpen = (path: string, open: boolean) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (open) next.delete(path);
      else next.add(path);
      return next;
    });

  const startNew = (mode: "new-file" | "new-folder", dir: string) => {
    if (dir) setOpen(dir.slice(0, -1), true);
    setMenu(null);
    setInline({ mode, baseDir: dir });
  };

  const selected = focused ? findNode(files, focused) : activeFile;
  useIdeEvent("veda:new-file", () => startNew("new-file", baseDir(selected ?? null)));

  const startRename = (node: FileNode) => {
    setMenu(null);
    if (node.type !== "file") return; // folder rename is not supported in the MVP
    setInline({ mode: "rename", path: node.path });
  };

  const exists = (path: string) => !!findNode(files, path);

  const commitNew = (name: string) => {
    if (inline && inline.mode !== "rename") createFile(inline.baseDir + name, inline.mode === "new-file" ? "file" : "directory");
    setInline(null);
  };

  const commitRename = (node: FileNode, name: string) => {
    setInline(null);
    if (name === node.name) return;
    const newPath = dirOf(node.path) + name;
    createFile(newPath, "file", node.content ?? "");
    deleteFile(node.path);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const target = e.target as HTMLElement;
    if (target.tagName === "INPUT") return;
    const path = target.closest<HTMLElement>("[role='treeitem']")?.dataset.path;
    const idx = visible.findIndex((r) => r.node.path === path);
    if (idx < 0) return;
    const { node, parent } = visible[idx];
    const isDir = node.type === "directory";
    const isOpen = isDir && !collapsed.has(node.path);
    const go = (i: number) => {
      const r = visible[Math.max(0, Math.min(visible.length - 1, i))];
      if (r) focusRow(r.node.path);
    };
    switch (e.key) {
      case "ArrowDown": e.preventDefault(); go(idx + 1); break;
      case "ArrowUp": e.preventDefault(); go(idx - 1); break;
      case "Home": e.preventDefault(); go(0); break;
      case "End": e.preventDefault(); go(visible.length - 1); break;
      case "ArrowRight":
        e.preventDefault();
        if (isDir && !isOpen) setOpen(node.path, true);
        else if (isOpen && visible[idx + 1]?.parent === node.path) go(idx + 1);
        break;
      case "ArrowLeft":
        e.preventDefault();
        if (isOpen) setOpen(node.path, false);
        else if (parent) focusRow(parent);
        break;
      case "Enter":
      case " ":
        e.preventDefault();
        if (isDir) setOpen(node.path, !isOpen);
        else open(node.path);
        break;
      case "F2": e.preventDefault(); startRename(node); break;
      case "Delete": e.preventDefault(); setToDelete(node); break;
      case "ContextMenu":
      case "F10": {
        if (e.key === "F10" && !e.shiftKey) break;
        e.preventDefault();
        const r = target.getBoundingClientRect();
        setMenu({ x: r.left + 24, y: r.bottom, node });
        break;
      }
    }
  };

  const newRow = (depth: number, mode: "new-file" | "new-folder") => (
    <InlineNameInput
      key={`new-${mode}`}
      depth={depth}
      label={mode === "new-file" ? "New file name" : "New folder name"}
      icon={<FileIcon name={mode === "new-file" ? "" : "dir"} type={mode === "new-file" ? "file" : "directory"} />}
      validate={(n) => (exists(inline && inline.mode !== "rename" ? inline.baseDir + n : n) ? `${n} already exists.` : null)}
      onSubmit={commitNew}
      onCancel={() => setInline(null)}
    />
  );

  const rows: React.ReactNode[] = [];
  const newAt = inline && inline.mode !== "rename" ? inline : null;
  for (const { node, depth } of visible) {
    const isDir = node.type === "directory";
    const isOpen = isDir && !collapsed.has(node.path);
    const isActive = node.path === activePath;
    if (inline?.mode === "rename" && inline.path === node.path) {
      rows.push(
        <InlineNameInput
          key={node.path}
          depth={depth}
          label="Rename file"
          initial={node.name}
          icon={<FileIcon name={node.name} />}
          validate={(n) => (n !== node.name && exists(dirOf(node.path) + n) ? `${dirOf(node.path) + n} already exists.` : null)}
          onSubmit={(n) => commitRename(node, n)}
          onCancel={() => setInline(null)}
        />,
      );
    } else {
      rows.push(
        <div
          key={node.path}
          role="treeitem"
          aria-selected={isActive}
          aria-expanded={isDir ? isOpen : undefined}
          aria-level={depth + 1}
          data-path={node.path}
          tabIndex={node.path === rovingPath ? 0 : -1}
          title={node.path}
          className={cn(
            "relative flex h-6 cursor-pointer select-none items-center gap-1.5 rounded-sm pr-2 text-ui outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring",
            isActive ? "bg-accent-subtle text-fg" : "text-fg-2 hover:bg-fg/[0.06] hover:text-fg",
          )}
          style={{ paddingLeft: ROW_PAD + depth * INDENT }}
          onClick={() => {
            setFocused(node.path);
            if (isDir) setOpen(node.path, !isOpen);
            else open(node.path);
          }}
          onFocus={() => setFocused(node.path)}
          onContextMenu={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setFocused(node.path);
            setMenu({ x: e.clientX, y: e.clientY, node });
          }}
        >
          {Array.from({ length: depth }, (_, i) => (
            <span key={i} aria-hidden="true" className="pointer-events-none absolute inset-y-0 w-px bg-line" style={{ left: ROW_PAD + i * INDENT + 7 }} />
          ))}
          {isDir ? (
            <ChevronRight size={14} aria-hidden="true" className={cn("shrink-0 text-fg-3 transition-transform duration-120", isOpen && "rotate-90")} />
          ) : (
            <span className="w-3.5 shrink-0" aria-hidden="true" />
          )}
          <FileIcon name={node.name} type={node.type} open={isOpen} />
          <span className="truncate">{node.name}</span>
        </div>,
      );
    }
    if (isDir && isOpen && newAt && newAt.baseDir === node.path + "/") rows.push(newRow(depth + 1, newAt.mode));
  }
  if (newAt && newAt.baseDir === "") rows.push(newRow(0, newAt.mode));

  const iconBtn = "text-fg-3 hover:text-fg";
  return (
    <div className="flex h-full min-h-0 w-full flex-col bg-panel">
      <div className="sticky top-0 z-10 flex h-9 shrink-0 items-center justify-between border-b border-line bg-panel pl-3 pr-1.5">
        <h2 className="text-overline font-semibold uppercase tracking-[0.08em] text-fg-3">Explorer</h2>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon-sm" className={iconBtn} aria-label="New file" title="New file" onClick={() => startNew("new-file", baseDir(selected ?? null))}>
            <FilePlus size={16} aria-hidden="true" />
          </Button>
          <Button variant="ghost" size="icon-sm" className={iconBtn} aria-label="New folder" title="New folder" onClick={() => startNew("new-folder", baseDir(selected ?? null))}>
            <FolderPlus size={16} aria-hidden="true" />
          </Button>
        </div>
      </div>
      <div
        id="file-tree"
        role="tree"
        aria-label="Files"
        className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden py-1"
        onKeyDown={onKeyDown}
        onContextMenu={(e) => {
          e.preventDefault();
          setMenu({ x: e.clientX, y: e.clientY, node: null });
        }}
      >
        {rows}
        {files.length === 0 && !newAt && <p className="px-3 py-2 text-caption text-fg-3">No files yet. Use New file above.</p>}
      </div>
      {menu && (
        <TreeContextMenu
          menu={menu}
          onClose={closeMenu}
          onNewFile={() => startNew("new-file", baseDir(menu.node))}
          onNewFolder={() => startNew("new-folder", baseDir(menu.node))}
          onRename={() => menu.node && startRename(menu.node)}
          onDelete={() => {
            setToDelete(menu.node);
            setMenu(null);
          }}
        />
      )}
      <Dialog
        open={toDelete !== null}
        onClose={() => setToDelete(null)}
        title={toDelete ? `Delete ${toDelete.name}?` : "Delete"}
        description={toDelete?.type === "directory" ? "This folder and everything in it will be deleted." : "This file will be deleted."}
        className="w-[min(26rem,calc(100vw-2rem))]"
      >
        <div
          className="flex justify-end gap-2"
          onKeyDown={(e) => {
            if (e.key === "Enter" && toDelete && !e.nativeEvent.isComposing && (e.target as HTMLElement).tagName !== "BUTTON") {
              deleteFile(toDelete.path);
              setToDelete(null);
            }
          }}
        >
          <Button variant="secondary" size="sm" onClick={() => setToDelete(null)}>
            Cancel
          </Button>
          <Button
            variant="danger"
            size="sm"
            autoFocus
            onClick={() => {
              if (toDelete) deleteFile(toDelete.path);
              setToDelete(null);
            }}
          >
            Delete
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
