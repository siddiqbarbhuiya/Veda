"use client";

import { useMemo } from "react";
import { FilePen, FilePlus, FileX } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { diffStats, lineDiff, withContext } from "@/lib/agent/diff";
import type { FileChange } from "@/lib/agent/events";
import type { ChangeDecision } from "@/hooks/use-agent";

const MAX_DIFF_LINES = 400;

const OP = {
  create: { label: "New", icon: FilePlus },
  update: { label: "Edited", icon: FilePen },
  delete: { label: "Deleted", icon: FileX },
} as const;

function DiffView({ before, after }: { before: string; after: string }) {
  const lines = useMemo(() => withContext(lineDiff(before, after), 2), [before, after]);
  const shown = lines.slice(0, MAX_DIFF_LINES);
  return (
    <div className="max-h-64 overflow-auto border-t border-line bg-editor font-mono text-caption leading-5" role="region" aria-label="Changed lines">
      {shown.map((l, i) => (
        <div
          key={i}
          className={cn(
            "flex whitespace-pre-wrap wrap-anywhere px-2",
            l.kind === "add" && "bg-success-subtle text-success",
            l.kind === "del" && "bg-danger-subtle text-danger",
            l.kind === "same" && "text-fg-3",
          )}
        >
          {/* The sign carries the meaning, so the color is not the only signal. */}
          <span aria-hidden="true" className="w-4 shrink-0 select-none">
            {l.kind === "add" ? "+" : l.kind === "del" ? "−" : " "}
          </span>
          <span className="sr-only">{l.kind === "add" ? "Added: " : l.kind === "del" ? "Removed: " : ""}</span>
          <span className="min-w-0 flex-1">{l.text}</span>
        </div>
      ))}
      {lines.length > MAX_DIFF_LINES ? (
        <p className="px-2 py-1 text-fg-3">Showing the first {MAX_DIFF_LINES} lines of the diff.</p>
      ) : null}
    </div>
  );
}

/**
 * The file changes of one run. Nothing is written until the student accepts it.
 * `base` is the project when the run started, so each diff shows exactly what changes.
 */
export function ChangesCard({
  changes,
  base,
  decisions,
  onAccept,
  onReject,
}: {
  changes: FileChange[];
  base: Record<string, string>;
  decisions: Record<string, ChangeDecision>;
  onAccept: (paths: string[], overwrite?: boolean) => void;
  onReject: (paths: string[]) => void;
}) {
  const pending = changes.filter((c) => (decisions[c.path] ?? "pending") === "pending").map((c) => c.path);
  return (
    <section aria-label="File changes from Claude Code" className="rounded-md border border-line-strong bg-panel">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-2 py-1.5">
        <h3 className="text-ui font-medium text-fg">
          {changes.length} file {changes.length === 1 ? "change" : "changes"}
        </h3>
        {pending.length > 1 ? (
          <div className="flex gap-1.5">
            <Button variant="primary" size="xs" onClick={() => onAccept(pending)}>
              Accept all
            </Button>
            <Button variant="secondary" size="xs" onClick={() => onReject(pending)}>
              Reject all
            </Button>
          </div>
        ) : null}
      </header>
      <ul>
        {changes.map((c) => {
          const decision = decisions[c.path] ?? "pending";
          const op = OP[c.op];
          const before = base[c.path] ?? "";
          const after = c.content ?? "";
          const stats = diffStats(lineDiff(before, after));
          return (
            <li key={c.path} className="border-b border-line last:border-b-0">
              <details>
                <summary className="flex cursor-pointer list-none flex-wrap items-center gap-2 px-2 py-1.5 text-caption focus-visible:outline-2 focus-visible:outline-ring">
                  <op.icon size={14} aria-hidden="true" className="shrink-0 text-fg-3" />
                  <span className="min-w-0 flex-1 truncate font-mono text-fg" title={c.path}>
                    {c.path}
                  </span>
                  <Badge tone={c.op === "delete" ? "danger" : c.op === "create" ? "success" : "info"}>{op.label}</Badge>
                  <span className="tnum text-fg-3">
                    +{stats.added} −{stats.removed}
                  </span>
                </summary>
                {c.op === "delete" ? (
                  <p className="border-t border-line px-2 py-1.5 text-caption text-fg-3">This file will be deleted.</p>
                ) : (
                  <DiffView before={before} after={after} />
                )}
              </details>
              <div className="flex flex-wrap items-center gap-1.5 px-2 pb-1.5 pt-0.5">
                {decision === "pending" ? (
                  <>
                    <Button variant="primary" size="xs" onClick={() => onAccept([c.path])}>
                      Accept
                    </Button>
                    <Button variant="secondary" size="xs" onClick={() => onReject([c.path])}>
                      Reject
                    </Button>
                  </>
                ) : decision === "applied" ? (
                  <Badge tone="success">Applied</Badge>
                ) : decision === "rejected" ? (
                  <Badge tone="neutral">Rejected</Badge>
                ) : (
                  <>
                    <Badge tone="warning">You changed this file</Badge>
                    <Button variant="secondary" size="xs" onClick={() => onAccept([c.path], true)}>
                      Overwrite
                    </Button>
                    <Button variant="ghost" size="xs" onClick={() => onReject([c.path])}>
                      Keep mine
                    </Button>
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
