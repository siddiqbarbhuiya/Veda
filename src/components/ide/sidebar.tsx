"use client";

import { useEffect, useId, useState } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";
import FileTree from "./file-tree";
import { PackagesPanel } from "./packages-panel";
import { useIdeEvent } from "./ide-events";

const OPEN_KEY = "veda-sidebar-packages-open";

function readOpen(): boolean {
  try {
    return localStorage.getItem(OPEN_KEY) === "1";
  } catch {
    return false;
  }
}

function saveOpen(open: boolean) {
  try {
    localStorage.setItem(OPEN_KEY, open ? "1" : "0");
  } catch {
    /* storage is blocked */
  }
}

/** A collapsible section under the file tree, like OUTLINE and TIMELINE in VS Code. */
function Section({
  title,
  open,
  onToggle,
  children,
}: {
  title: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  const bodyId = useId();
  return (
    <section aria-label={title} className="flex min-h-0 shrink-0 flex-col border-t border-line bg-panel">
      <h2 className="m-0">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={onToggle}
          className="flex h-7 w-full items-center gap-1 px-1.5 text-left text-overline font-semibold uppercase tracking-[0.08em] text-fg-2 hover:bg-fg/[0.06] hover:text-fg focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
        >
          <ChevronRight size={14} aria-hidden="true" className={cn("shrink-0 transition-transform duration-120", open && "rotate-90")} />
          {title}
        </button>
      </h2>
      {/* The body stays mounted when it is closed, so a search or an install in progress is not lost. */}
      <div id={bodyId} hidden={!open} className="max-h-[55dvh] min-h-0 overflow-y-auto">
        {children}
      </div>
    </section>
  );
}

/** The Explorer: the file tree and, below it, the PACKAGES section. */
export default function Sidebar() {
  const [packagesOpen, setPackagesOpen] = useState(false);
  const [focusToken, setFocusToken] = useState(0);

  // Read the saved state after the first render, so the server and the browser draw the same page.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPackagesOpen(readOpen());
  }, []);

  const toggle = () =>
    setPackagesOpen((o) => {
      saveOpen(!o);
      return !o;
    });

  // The menu, the command palette and the terminal button ask for the packages section.
  useIdeEvent("veda:show-packages", () => {
    setPackagesOpen(true);
    saveOpen(true);
    setFocusToken((n) => n + 1);
  });

  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      <div className="min-h-0 flex-1">
        <FileTree />
      </div>
      <Section title="Packages" open={packagesOpen} onToggle={toggle}>
        <PackagesPanel focusToken={focusToken} />
      </Section>
    </div>
  );
}
