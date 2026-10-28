"use client";

import { useState } from "react";
import { useFileSystem, type FileNode } from "@/hooks/use-file-system";

type Menu = { x: number; y: number; node: FileNode | null } | null;

function TreeNode({
  node, depth, activePath, onOpen, onMenu,
}: {
  node: FileNode; depth: number; activePath: string | null;
  onOpen: (p: string) => void; onMenu: (e: React.MouseEvent, n: FileNode) => void;
}) {
  const [open, setOpen] = useState(true);
  const isDir = node.type === "directory";
  return (
    <div>
      <div
        role="treeitem"
        aria-selected={node.path === activePath}
        data-path={node.path}
        className={`flex cursor-pointer items-center gap-1 px-2 py-0.5 text-sm hover:bg-neutral-800 ${
          node.path === activePath ? "bg-neutral-800" : ""
        }`}
        style={{ paddingLeft: 8 + depth * 12 }}
        onClick={() => (isDir ? setOpen(!open) : onOpen(node.path))}
        onContextMenu={(e) => onMenu(e, node)}
      >
        <span aria-hidden>{isDir ? (open ? "\u{1F4C2}" : "\u{1F4C1}") : "\u{1F4C4}"}</span>
        <span className="truncate">{node.name}</span>
      </div>
      {isDir && open &&
        node.children?.map((c) => (
          <TreeNode key={c.path} node={c} depth={depth + 1} activePath={activePath} onOpen={onOpen} onMenu={onMenu} />
        ))}
    </div>
  );
}

function dirOf(path: string) {
  return path.includes("/") ? path.slice(0, path.lastIndexOf("/") + 1) : "";
}

export default function FileTree() {
  const { files, activeFile, openFile, createFile, deleteFile } = useFileSystem();
  const [menu, setMenu] = useState<Menu>(null);

  const baseDir = (n: FileNode | null) => (!n ? "" : n.type === "directory" ? n.path + "/" : dirOf(n.path));

  const create = (type: "file" | "directory") => {
    const name = window.prompt(type === "file" ? "New file name" : "New folder name");
    if (name && name.trim()) createFile(baseDir(menu?.node ?? null) + name.trim(), type);
    setMenu(null);
  };

  const rename = () => {
    const node = menu?.node;
    setMenu(null);
    if (!node || node.type !== "file") return; // folder rename is not supported in the MVP
    const name = window.prompt("Rename to", node.name);
    if (!name || !name.trim() || name === node.name) return;
    createFile(dirOf(node.path) + name.trim(), "file", node.content ?? "");
    deleteFile(node.path);
  };

  const remove = () => {
    if (menu?.node && window.confirm(`Delete ${menu.node.name}?`)) deleteFile(menu.node.path);
    setMenu(null);
  };

  const btn = "block w-full px-3 py-1 text-left hover:bg-neutral-800";

  return (
    <div
      id="file-tree"
      role="tree"
      className="h-full overflow-auto py-1"
      onContextMenu={(e) => {
        e.preventDefault();
        setMenu({ x: e.clientX, y: e.clientY, node: null });
      }}
      onClick={() => setMenu(null)}
    >
      {files.map((n) => (
        <TreeNode
          key={n.path}
          node={n}
          depth={0}
          activePath={activeFile?.path ?? null}
          onOpen={openFile}
          onMenu={(e, node) => {
            e.preventDefault();
            e.stopPropagation();
            setMenu({ x: e.clientX, y: e.clientY, node });
          }}
        />
      ))}
      {menu && (
        <div
          className="fixed z-50 w-36 rounded border border-neutral-700 bg-neutral-900 py-1 text-sm shadow-lg"
          style={{ left: menu.x, top: menu.y }}
        >
          <button className={btn} onClick={() => create("file")}>New File</button>
          <button className={btn} onClick={() => create("directory")}>New Folder</button>
          {menu.node && (
            <>
              <button className={btn} onClick={rename}>Rename</button>
              <button className={btn + " text-red-400"} onClick={remove}>Delete</button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
