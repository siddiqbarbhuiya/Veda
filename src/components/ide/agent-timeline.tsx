"use client";

import { AlertCircle, Brain, Check, FileText, Loader2, Search, ShieldAlert, Terminal, Wrench, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import type { TimelineItem } from "@/lib/agent/timeline";
import { ChatMessageView, Markdown } from "./chat-message";

const ICON_PROPS = { size: 14, "aria-hidden": true, className: "shrink-0 text-fg-3" } as const;

function ToolIcon({ name }: { name: string }) {
  if (name === "Bash") return <Terminal {...ICON_PROPS} />;
  if (name === "Grep" || name === "Glob") return <Search {...ICON_PROPS} />;
  if (name === "Read" || name === "Write" || name === "Edit") return <FileText {...ICON_PROPS} />;
  return <Wrench {...ICON_PROPS} />;
}

function ToolCard({ item, running }: { item: Extract<TimelineItem, { kind: "tool" }>; running: boolean }) {
  const result = item.result;
  const pending = !result && running;
  return (
    <details className="group rounded-md border border-line bg-sunken text-caption">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-2 py-1.5 focus-visible:outline-2 focus-visible:outline-ring">
        <ToolIcon name={item.name} />
        <span className="shrink-0 font-medium text-fg">{item.name}</span>
        <span className="min-w-0 flex-1 truncate font-mono text-fg-2" title={item.summary}>
          {item.summary}
        </span>
        {pending ? (
          <>
            <Loader2 size={12} aria-hidden="true" className="shrink-0 animate-spin text-fg-3" />
            <span className="sr-only">Running</span>
          </>
        ) : result ? (
          result.ok ? (
            <>
              <Check size={12} aria-hidden="true" className="shrink-0 text-success" />
              <span className="sr-only">Done</span>
            </>
          ) : (
            <>
              <X size={12} aria-hidden="true" className="shrink-0 text-danger" />
              <span className="sr-only">Failed</span>
            </>
          )
        ) : null}
      </summary>
      {result?.output ? (
        <pre className="max-h-48 overflow-auto whitespace-pre-wrap wrap-anywhere border-t border-line px-2 py-1.5 font-mono text-fg-2">
          {result.output}
        </pre>
      ) : null}
    </details>
  );
}

const ASKS: Record<string, string> = {
  Bash: "Claude Code asks to run a command",
  Edit: "Claude Code asks to edit a file",
  Write: "Claude Code asks to write a file",
};

function PermissionCard({
  item,
  open,
  onAnswer,
}: {
  item: Extract<TimelineItem, { kind: "permission" }>;
  open: boolean;
  onAnswer: (allow: boolean, always: boolean) => void;
}) {
  const isPlan = item.tool === "ExitPlanMode";
  const canAlways = item.tool === "Bash" || item.tool === "Edit" || item.tool === "Write";
  return (
    <div role="group" aria-label="Permission request" className="rounded-md border border-warning/40 bg-warning-subtle p-2 text-caption">
      <p className="flex items-center gap-1.5 font-medium text-warning">
        <ShieldAlert size={14} aria-hidden="true" />
        {isPlan ? "Claude Code has a plan" : (ASKS[item.tool] ?? `Claude Code asks to use ${item.tool}`)}
      </p>
      {isPlan ? (
        <div className="mt-1.5 max-h-56 overflow-auto rounded bg-sunken px-2 py-1.5 text-fg">
          <Markdown text={item.summary} />
        </div>
      ) : (
        <pre className="mt-1.5 max-h-24 overflow-auto whitespace-pre-wrap wrap-anywhere rounded bg-sunken px-2 py-1 font-mono text-fg">
          {item.summary}
        </pre>
      )}
      {open ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          <Button variant="primary" size="xs" onClick={() => onAnswer(true, false)}>
            {isPlan ? "Approve plan" : "Allow"}
          </Button>
          {canAlways ? (
            <Button variant="secondary" size="xs" onClick={() => onAnswer(true, true)}>
              {item.tool === "Bash" ? "Allow all commands in this run" : "Allow all edits in this run"}
            </Button>
          ) : null}
          <Button variant="secondary" size="xs" onClick={() => onAnswer(false, false)}>
            {isPlan ? "Keep planning" : "Deny"}
          </Button>
        </div>
      ) : (
        <p className="mt-1.5 text-fg-3">Answered.</p>
      )}
    </div>
  );
}

/** The steps of one Claude Code turn: messages, tool calls, permission requests and errors. */
export function AgentTimeline({
  items,
  running,
  openPermissions,
  answered,
  onAnswer,
}: {
  items: TimelineItem[];
  /** True while this turn is still running. */
  running: boolean;
  openPermissions: ReadonlySet<string>;
  answered: ReadonlySet<string>;
  onAnswer: (permissionId: string, allow: boolean, always: boolean) => void;
}) {
  return (
    <div className="flex flex-col gap-2.5">
      {items.map((item) => {
        switch (item.kind) {
          case "text":
            return <ChatMessageView key={item.seq} role="assistant" content={item.text} streaming={false} />;
          case "thinking":
            return (
              <details key={item.seq} className="rounded-md border border-line text-caption text-fg-3">
                <summary className="flex cursor-pointer list-none items-center gap-1.5 px-2 py-1 focus-visible:outline-2 focus-visible:outline-ring">
                  <Brain size={12} aria-hidden="true" />
                  Thinking
                </summary>
                <p className="whitespace-pre-wrap wrap-anywhere border-t border-line px-2 py-1.5">{item.text}</p>
              </details>
            );
          case "tool":
            return <ToolCard key={item.seq} item={item} running={running} />;
          case "permission":
            return (
              <PermissionCard
                key={item.seq}
                item={item}
                open={running && openPermissions.has(item.id) && !answered.has(item.id)}
                onAnswer={(allow, always) => onAnswer(item.id, allow, always)}
              />
            );
          case "error":
            return (
              <div
                key={item.seq}
                role="alert"
                className={cn("flex items-start gap-2 rounded-md border border-danger/30 bg-danger-subtle p-2 text-caption text-danger")}
              >
                <AlertCircle size={14} aria-hidden="true" className="mt-0.5 shrink-0" />
                <span className="wrap-anywhere min-w-0 flex-1">{item.message}</span>
              </div>
            );
        }
      })}
    </div>
  );
}
