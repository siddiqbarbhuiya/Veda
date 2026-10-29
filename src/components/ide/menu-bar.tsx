"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/cn";
import { useFileSystem } from "@/hooks/use-file-system";
import { useRuntimeState } from "./ide-events";
import { displayKeys } from "./use-ide-shortcuts";
import { pasteFromClipboard, runEditorAction } from "./editor-bridge";
import { setEditorPrefs, useEditorPrefs } from "./editor-prefs";
import { buildMenus, type MenuActions, type MenuItem } from "./menu-model";

type ShellActions = Omit<MenuActions, "editor" | "paste" | "setPrefs">;
type ItemOf = Extract<MenuItem, { type: "item" }>;

const topButton =
  "flex h-6 items-center rounded px-2 text-ui text-fg-2 hover:bg-fg/[0.07] hover:text-fg focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring aria-expanded:bg-fg/[0.09] aria-expanded:text-fg";
const rowClass =
  "flex h-7 w-full items-center gap-2 rounded px-2 text-left text-ui text-fg-2 hover:bg-fg/[0.07] hover:text-fg focus-visible:bg-fg/[0.07] focus-visible:text-fg focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring aria-disabled:cursor-default aria-disabled:opacity-40 aria-disabled:hover:bg-transparent aria-disabled:hover:text-fg-2";

/** The File, Edit, Selection, View, Go, Run, Terminal and Help menus above the editor. */
export function MenuBar({ shell }: { shell: ShellActions }) {
  const { activeFile } = useFileSystem();
  const { status } = useRuntimeState();
  const prefs = useEditorPrefs();
  const [openId, setOpenId] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const menuRef = useRef<HTMLDivElement>(null);

  const actions: MenuActions = useMemo(
    () => ({
      ...shell,
      editor: (id) => void runEditorAction(id),
      paste: () => void pasteFromClipboard(),
      setPrefs: setEditorPrefs,
    }),
    [shell]
  );
  const menus = useMemo(
    () =>
      buildMenus(actions, {
        hasFile: activeFile?.type === "file",
        busy: status === "booting" || status === "running",
        prefs,
      }),
    [actions, activeFile, status, prefs]
  );

  const close = useCallback((focusButton = false) => {
    setOpenId((id) => {
      if (id && focusButton) buttonRefs.current[id]?.focus();
      return null;
    });
  }, []);

  // Close when the user clicks outside or leaves the window.
  useEffect(() => {
    if (!openId) return;
    const down = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpenId(null);
    };
    const blur = () => setOpenId(null);
    window.addEventListener("pointerdown", down, true);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("pointerdown", down, true);
      window.removeEventListener("blur", blur);
    };
  }, [openId]);

  // When a menu opens by keyboard, focus its first enabled item.
  const focusFirst = useRef(false);
  useEffect(() => {
    if (!openId || !focusFirst.current) return;
    focusFirst.current = false;
    menuRef.current?.querySelector<HTMLElement>('[role^="menuitem"]:not([aria-disabled="true"])')?.focus();
  }, [openId]);

  const ids = menus.map((m) => m.id);
  const step = (from: string, delta: number) => ids[(ids.indexOf(from) + delta + ids.length) % ids.length];

  const onTopKey = (e: React.KeyboardEvent, id: string) => {
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      e.preventDefault();
      const next = step(id, e.key === "ArrowRight" ? 1 : -1);
      buttonRefs.current[next]?.focus();
      if (openId) setOpenId(next);
    } else if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      focusFirst.current = true;
      setOpenId(id);
    } else if (e.key === "Escape") {
      close();
    }
  };

  const onMenuKey = (e: React.KeyboardEvent, id: string) => {
    const rows = Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role^="menuitem"]:not([aria-disabled="true"])') ?? []);
    const i = rows.indexOf(document.activeElement as HTMLElement);
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (rows.length === 0) return;
      const next = e.key === "ArrowDown" ? (i + 1) % rows.length : (i - 1 + rows.length) % rows.length;
      rows[next]?.focus();
    } else if (e.key === "Home" || e.key === "End") {
      e.preventDefault();
      rows[e.key === "Home" ? 0 : rows.length - 1]?.focus();
    } else if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      e.preventDefault();
      const next = step(id, e.key === "ArrowRight" ? 1 : -1);
      focusFirst.current = true;
      setOpenId(next);
      buttonRefs.current[next]?.focus();
    } else if (e.key === "Escape") {
      e.preventDefault();
      close(true);
    } else if (e.key === "Tab") {
      close();
    }
  };

  const choose = (item: ItemOf) => {
    if (item.disabled) return;
    setOpenId(null);
    // Run after the menu has closed, so the action can move the focus.
    requestAnimationFrame(() => item.run());
  };

  const rovingId = openId ?? ids[0];

  return (
    <div
      ref={rootRef}
      role="menubar"
      aria-label="Application menu"
      className="relative flex h-7 shrink-0 items-center gap-0.5 overflow-visible border-b border-line bg-panel px-2"
    >
      {menus.map((menu) => {
        const open = openId === menu.id;
        return (
          <div key={menu.id} className="relative">
            <button
              ref={(el) => {
                buttonRefs.current[menu.id] = el;
              }}
              type="button"
              role="menuitem"
              aria-haspopup="menu"
              aria-expanded={open}
              tabIndex={rovingId === menu.id ? 0 : -1}
              className={topButton}
              onClick={() => setOpenId(open ? null : menu.id)}
              onMouseEnter={() => {
                if (openId && openId !== menu.id) setOpenId(menu.id);
              }}
              onKeyDown={(e) => onTopKey(e, menu.id)}
            >
              {menu.label}
            </button>
            {open ? (
              <div
                ref={menuRef}
                role="menu"
                aria-label={menu.label}
                onKeyDown={(e) => onMenuKey(e, menu.id)}
                className="absolute left-0 top-full z-50 mt-0.5 min-w-60 max-w-[min(22rem,calc(100vw-1rem))] animate-fade-in rounded-lg border border-line-strong bg-overlay p-1 shadow-e2"
              >
                {menu.items.map((it, i) =>
                  it.type === "separator" ? (
                    <div key={`sep-${i}`} role="separator" className="my-1 h-px bg-line" />
                  ) : (
                    <button
                      key={it.id}
                      type="button"
                      role={it.checked === undefined ? "menuitem" : "menuitemcheckbox"}
                      aria-checked={it.checked === undefined ? undefined : it.checked}
                      aria-disabled={it.disabled ? true : undefined}
                      tabIndex={-1}
                      className={rowClass}
                      onClick={() => choose(it)}
                    >
                      <span className="flex w-4 shrink-0 justify-center" aria-hidden="true">
                        {it.checked ? <Check size={14} /> : null}
                      </span>
                      <span className="flex-1 truncate">{it.label}</span>
                      {it.keys ? (
                        <span className={cn("ml-6 shrink-0 text-caption text-fg-3")}>{displayKeys(it.keys).join("+")}</span>
                      ) : null}
                    </button>
                  )
                )}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
