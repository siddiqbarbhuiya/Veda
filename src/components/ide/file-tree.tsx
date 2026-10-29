"use client";

import { useCallback, useMemo, useState } from "react";
import { ChevronRight, FilePlus, FolderPlus } from "lucide-react";
import { useFileSystem, findNode, type FileNode } from "@/hooks/use-file-system";
import { validateName, validateNewPath } from "@/lib/files/validate-name";
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

function sortNodes(nodes: FileNode[]): FileNode[] {
  return [...nodes].sort((a, b) => {
    if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
    return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });
  });
}

function countFiles(n: FileNode): number {
  return n.type === "file" ? 1 : (n.children ?? []).reduce((sum, c) => sum + countFiles(c), 0);
}

const baseDir = (n: FileNode | null) => (!n ? "" : n.type === "directory" ? n.path + "/" : dirOf(n.path));

export default function FileTree() {
  const { files, activeFile, openFile, createFile, deleteFile, renameNode, loaded } = useFileSystem();
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
      for (const n of sortNodes(nodes)) {
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

  const selected = (focused ? findNode(files, focused) : null) ?? activeFile;
  useIdeEvent("veda:new-file", () => startNew("new-file", baseDir(selected ?? null)));

  const startRename = (node: FileNode) => {
    setMenu(null);
    setInline({ mode: "rename", path: node.path });
  };

  const siblingNames = (dir: string, except?: string) => {
    const list = dir ? (findNode(files, dir)?.children ?? []) : files;
    return list.filter((n) => n.path !== except).map((n) => n.name);
  };

  /** Returns the full path to create, or the reason the name is not valid. */
  const checkNew = (mode: "new-file" | "new-folder", dir: string, name: string) =>
    mode === "new-file"
      ? validateNewPath(files, dir, name)
      : (() => {
          const r = validateName(name, siblingNames(dir.replace(/\/$/, "")));
          return r.ok ? ({ ok: true, value: dir + r.value } as const) : r;
        })();

  const checkRename = (node: FileNode, name: string) =>
    validateName(name, siblingNames(dirOf(node.path).replace(/\/$/, ""), node.path));

  const commitNew = (name: string) => {
    if (inline && inline.mode !== "rename") {
      const r = checkNew(inline.mode, inline.baseDir, name);
      if (r.ok) {
        const isDir = inline.mode === "new-folder";
        createFile(r.value, isDir ? "directory" : "file");
        if (isDir) {
          setOpen(r.value, true);
          setFocused(r.value);
        }
      }
    }
    setInline(null);
  };

  const commitRename = (node: FileNode, name: string) => {
    setInline(null);
    if (name === node.name || !checkRename(node, name).ok) return;
    const newPath = dirOf(node.path) + name;
    renameNode(node.path, newPath);
    setFocused(newPath);
    // Keep the collapsed state of a renamed folder.
    setCollapsed((prev) => {
      const next = new Set<string>();
      for (const p of prev) next.add(p === node.path ? newPath : p.startsWith(node.path + "/") ? newPath + p.slice(node.path.length) : p);
      return next;
    });
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
      validate={(n) => {
        const r = inline && inline.mode !== "rename" ? checkNew(inline.mode, inline.baseDir, n) : null;
        return r && !r.ok ? r.reason : null;
      }}
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
          label={node.type === "directory" ? "Rename folder" : "Rename file"}
          initial={node.name}
          icon={<FileIcon name={node.name} type={node.type} />}
          validate={(n) => {
            if (n === node.name) return null;
            const r = checkRename(node, n);
            return r.ok ? null : r.reason;
          }}
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
          <Button variant="ghost" size="icon-sm" className={iconBtn} aria-label="New file" title="New file" disabled={!loaded} onClick={() => startNew("new-file", baseDir(selected ?? null))}>
            <FilePlus size={16} aria-hidden="true" />
          </Button>
          <Button variant="ghost" size="icon-sm" className={iconBtn} aria-label="New folder" title="New folder" disabled={!loaded} onClick={() => startNew("new-folder", baseDir(selected ?? null))}>
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
        {loaded && files.length === 0 && !newAt && <p className="px-3 py-2 text-caption text-fg-3">No files yet. Use New file above.</p>}
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
        description={
          toDelete?.type === "directory"
            ? `This folder and the ${countFiles(toDelete)} file${countFiles(toDelete) === 1 ? "" : "s"} in it will be deleted. You cannot undo this.`
            : "This file will be deleted. You cannot undo this."
        }
        className="w-[min(26rem,calc(100vw-2rem))]"
      >
        <div className="flex justify-end gap-2">
          <Button variant="secondary" size="sm" autoFocus onClick={() => setToDelete(null)}>
            Cancel
          </Button>
          <Button
            variant="danger"
            size="sm"
            onClick={() => {
              if (toDelete) {
                deleteFile(toDelete.path);
                setFocused(null);
              }
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
