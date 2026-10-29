"use client";

import { Fragment, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { FilePlus, FolderPlus, Pencil, Trash2 } from "lucide-react";
import { cn } from "@/lib/cn";
import type { FileNode } from "@/hooks/use-file-system";

export const ROW_PAD = 8;
export const INDENT = 12;

export function InlineNameInput({
  depth,
  icon,
  initial = "",
  label,
  validate,
  onSubmit,
  onCancel,
}: {
  depth: number;
  icon: ReactNode;
  initial?: string;
  label: string;
  validate: (name: string) => string | null;
  onSubmit: (name: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLInputElement>(null);
  const done = useRef(false);
  const errId = useId();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    const dot = initial.lastIndexOf(".");
    el.setSelectionRange(0, dot > 0 ? dot : initial.length);
  }, [initial]);

  const finish = (fn: () => void) => {
    if (done.current) return;
    done.current = true;
    fn();
  };

  return (
    <Fragment>
      <div className="flex h-6 items-center gap-1.5 pr-2" style={{ paddingLeft: ROW_PAD + depth * INDENT + 16 }}>
        {icon}
        <input
          ref={ref}
          value={value}
          aria-label={label}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errId : undefined}
          maxLength={512}
          spellCheck={false}
          autoComplete="off"
          onChange={(e) => {
            setValue(e.target.value);
            setError(null);
          }}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Escape") {
              e.preventDefault();
              finish(onCancel);
            } else if (e.key === "Enter") {
              e.preventDefault();
              if (e.nativeEvent.isComposing || e.keyCode === 229) return;
              // The name is not trimmed: a leading or trailing space is reported by validate.
              const err = validate(value);
              if (err) setError(err);
              else finish(() => onSubmit(value));
            }
          }}
          onBlur={() => {
            // A blur caused by a switch to another window keeps the input.
            if (document.hasFocus()) finish(onCancel);
          }}
          className={cn(
            "h-5 min-w-0 flex-1 rounded-sm border bg-sunken px-1 text-ui text-fg outline-none focus-visible:outline-none",
            error ? "border-danger" : "border-accent",
          )}
        />
      </div>
      {error && (
        <div id={errId} role="alert" className="wrap-anywhere px-2 py-0.5 text-caption text-danger" style={{ paddingLeft: ROW_PAD + depth * INDENT + 16 }}>
          {error}
        </div>
      )}
    </Fragment>
  );
}

export type MenuState = { x: number; y: number; node: FileNode | null };

export function TreeContextMenu({
  menu,
  onNewFile,
  onNewFolder,
  onRename,
  onDelete,
  onClose,
}: {
  menu: MenuState;
  onNewFile: () => void;
  onNewFolder: () => void;
  onRename: () => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x: menu.x, y: menu.y });

  // Clamp to the viewport once the real size is known.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos({
      x: Math.max(4, Math.min(menu.x, window.innerWidth - r.width - 4)),
      y: Math.max(4, Math.min(menu.y, window.innerHeight - r.height - 4)),
    });
    el.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
  }, [menu]);

  useEffect(() => {
    const down = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("pointerdown", down, true);
    window.addEventListener("keydown", key);
    window.addEventListener("blur", onClose);
    return () => {
      window.removeEventListener("pointerdown", down, true);
      window.removeEventListener("keydown", key);
      window.removeEventListener("blur", onClose);
    };
  }, [onClose]);

  const item =
    "flex h-7 w-full items-center gap-2 rounded px-2 text-left text-ui text-fg-2 hover:bg-fg/[0.07] hover:text-fg focus-visible:bg-fg/[0.07] focus-visible:text-fg focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring";

  const move = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const items = Array.from(ref.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
    const i = items.indexOf(document.activeElement as HTMLElement);
    const next = e.key === "ArrowDown" ? (i + 1) % items.length : (i - 1 + items.length) % items.length;
    items[next]?.focus();
  };

  return (
    <div
      ref={ref}
      role="menu"
      aria-label="File actions"
      onKeyDown={move}
      onContextMenu={(e) => e.preventDefault()}
      className="fixed z-40 w-44 animate-fade-in rounded-lg border border-line-strong bg-overlay p-1 shadow-e2"
      style={{ left: pos.x, top: pos.y }}
    >
      <button role="menuitem" className={item} onClick={onNewFile}>
        <FilePlus size={14} aria-hidden="true" /> New File
      </button>
      <button role="menuitem" className={item} onClick={onNewFolder}>
        <FolderPlus size={14} aria-hidden="true" /> New Folder
      </button>
      {menu.node && (
        <>
          <div role="separator" className="my-1 h-px bg-line" />
          <button role="menuitem" className={item} onClick={onRename}>
            <Pencil size={14} aria-hidden="true" /> Rename
          </button>
          <button role="menuitem" className={cn(item, "text-danger hover:text-danger focus-visible:text-danger")} onClick={onDelete}>
            <Trash2 size={14} aria-hidden="true" /> Delete
          </button>
        </>
      )}
    </div>
  );
}
