"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, ArrowDown, Info, Layers, Minimize2, RotateCw, ShieldCheck, SquarePen, Terminal } from "lucide-react";
import { answeredKey, useAgent, type AgentChoice } from "@/hooks/use-agent";
import { useAttachments } from "@/hooks/use-attachments";
import { useModelCatalog } from "@/hooks/use-model-catalog";
import { useStopwatch } from "@/hooks/use-stopwatch";
import { withAttachments } from "@/lib/attachments";
import { DEFAULT_AGENT_MODE, isAgentMode, type AgentMode } from "@/lib/agent/modes";
import { AGENT_PROVIDERS } from "@/lib/agent/env";
import { buildTimeline, changesOf, estimateContextTokens, openPermissions } from "@/lib/agent/timeline";
import { orderEntries } from "@/lib/combos";
import { useCombos } from "@/hooks/use-combos";
import { Button, buttonStyles } from "@/components/ui/button";
import { AgentTimeline } from "./agent-timeline";
import { ChangesCard } from "./changes-card";
import { ChatMessageView } from "./chat-message";
import { ComboDialog } from "./combo-dialog";
import { Composer, type SlashCommand } from "./composer";
import { ModeMenu } from "./mode-menu";
import { ModelPicker } from "./model-picker";
import { useIdeEvent } from "./ide-events";

const SUGGESTIONS = ["Add a README with setup steps", "Add input checks to this app", "Write tests for the main file"];
const MODEL_STORAGE_KEY = "veda:agent-model";
const MODE_STORAGE_KEY = "veda:agent-mode";
/** Used for the context ring when the provider does not tell the context size. */
const DEFAULT_CONTEXT_TOKENS = 128_000;
const NEAR_BOTTOM_PX = 80;

function readSavedModel(): string | null {
  try {
    return localStorage.getItem(MODEL_STORAGE_KEY);
  } catch {
    return null;
  }
}

// Permission ids of one turn that the student already answered.
function answeredIds(turnId: number, events: { type: string; id?: string }[], answered: ReadonlySet<string>): Set<string> {
  const out = new Set<string>();
  for (const e of events) {
    if (e.type === "permission" && e.id !== undefined && answered.has(answeredKey(turnId, e.id))) out.add(e.id);
  }
  return out;
}

function readMode(): AgentMode {
  try {
    const v = localStorage.getItem(MODE_STORAGE_KEY);
    return isAgentMode(v) ? v : DEFAULT_AGENT_MODE;
  } catch {
    return DEFAULT_AGENT_MODE;
  }
}

/**
 * The Claude Code tab. Claude Code runs in a private cloud sandbox. The student reviews every file change.
 * Models: Anthropic (own key) and OpenRouter (own key), alone or as a combo.
 */
export default function AgentPanel() {
  const agent = useAgent();
  const { items, state: catalogState } = useModelCatalog(AGENT_PROVIDERS);
  const [saved, setSaved] = useState<string | null>(readSavedModel);
  const { active: activeCombo } = useCombos();
  const [comboOpen, setComboOpen] = useState(false);
  const [input, setInput] = useState("");
  const [mode, setMode] = useState<AgentMode>(readMode);
  const [showJump, setShowJump] = useState(false);
  const files = useAttachments();
  const time = useStopwatch(agent.running);
  const scrollRef = useRef<HTMLDivElement>(null);
  const atBottomRef = useRef(true);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const roundRobin = useRef(0);

  const selected = useMemo(() => {
    if (saved && items.some((i) => i.key === saved)) return saved;
    return (items.find((i) => i.keyed)?.key ?? items[0]?.key) || "";
  }, [saved, items]);
  const item = items.find((i) => i.key === selected);

  // A combo may hold models that Claude Code cannot use (OpenAI, Gemini). Those entries are left out.
  const combo = useMemo(() => {
    if (!activeCombo) return null;
    const entries = activeCombo.entries.filter((e) => (AGENT_PROVIDERS as readonly string[]).includes(e.provider));
    return entries.length > 0 ? { ...activeCombo, entries } : null;
  }, [activeCombo]);

  const anyKey = items.some((i) => i.keyed);

  if (agent.draft !== null) {
    setInput((cur) => (cur ? cur : agent.draft!));
    agent.clearDraft();
  }

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const near = el.scrollHeight - el.scrollTop - el.clientHeight <= NEAR_BOTTOM_PX;
    atBottomRef.current = near;
    setShowJump(!near);
  };

  const scrollToBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    atBottomRef.current = true;
    setShowJump(false);
  }, []);

  useEffect(() => {
    if (atBottomRef.current) scrollToBottom();
    else setShowJump(true);
  }, [agent.turns, agent.error, scrollToBottom]);

  useIdeEvent("veda:new-chat", ({ tab }) => {
    if (tab === "agent") agent.newChat();
  });

  const choice = (): AgentChoice | null => {
    if (combo) {
      const [head, ...rest] = orderEntries(combo, roundRobin.current++);
      return { provider: head.provider, model: head.model, fallbacks: rest, strategy: combo.strategy, mode };
    }
    return item ? { provider: item.provider, model: item.model, mode } : null;
  };

  const submit = () => {
    const pick = choice();
    if (!input.trim() || agent.running || !pick) return;
    const text = withAttachments(input, files.attachments);
    setInput("");
    files.clear();
    atBottomRef.current = true;
    void agent.send(text, pick);
  };

  const commands: SlashCommand[] = [
    {
      id: "compact",
      label: "Compact conversation",
      description: "Claude Code summarizes the conversation to free context (/compact).",
      icon: <Minimize2 size={14} aria-hidden="true" />,
      disabled: agent.turns.length === 0 || agent.running || !(combo || item),
      run: () => {
        const pick = choice();
        if (pick) void agent.send("/compact", pick);
      },
    },
    {
      id: "clear",
      label: "New conversation",
      description: "Start again with an empty conversation.",
      icon: <SquarePen size={14} aria-hidden="true" />,
      run: agent.newChat,
    },
    {
      id: "combos",
      label: "Model combos…",
      description: "Try several models in order when one fails.",
      icon: <Layers size={14} aria-hidden="true" />,
      run: () => setComboOpen(true),
    },
  ];

  const canSend = !!(combo || item);
  const empty = agent.turns.length === 0 && !agent.error;

  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      <div className="relative min-h-0 flex-1">
        <div ref={scrollRef} onScroll={onScroll} className="h-full overflow-y-auto overflow-x-hidden px-3 py-3">
          {empty ? (
            <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
              <span className="flex size-10 items-center justify-center rounded-full bg-accent-subtle">
                <Terminal size={18} aria-hidden="true" className="text-accent-text" />
              </span>
              <p className="text-ui text-fg-2">Ask Claude Code to build or change your project.</p>
              <div className="flex w-full max-w-64 flex-col gap-2">
                {SUGGESTIONS.map((s) => (
                  <Button
                    key={s}
                    variant="secondary"
                    size="sm"
                    className="justify-start"
                    onClick={() => {
                      setInput(s);
                      taRef.current?.focus();
                    }}
                  >
                    {s}
                  </Button>
                ))}
              </div>
              <p className="flex max-w-64 items-start gap-1.5 text-left text-caption text-fg-3">
                <ShieldCheck size={14} aria-hidden="true" className="mt-0.5 shrink-0" />
                It works in a private cloud sandbox. You review every file change before it is applied. Strong models
                give the best results. Free models can struggle with multi-step edits.
              </p>
              {catalogState === "ready" && !anyKey ? (
                <a href="/dashboard" className={buttonStyles({ variant: "secondary", size: "xs" })}>
                  Add an OpenRouter or Anthropic key
                </a>
              ) : null}
            </div>
          ) : (
            <div className="flex flex-col gap-5">
              {agent.turns.map((turn, index) => {
                const last = index === agent.turns.length - 1;
                const live = last && agent.running;
                const changes = changesOf(turn.events);
                return (
                  <section key={turn.id} aria-label={`Request ${index + 1}`} className="flex flex-col gap-2.5">
                    <ChatMessageView role="user" content={turn.prompt} streaming={false} />
                    <AgentTimeline
                      items={buildTimeline(turn.events)}
                      running={live}
                      openPermissions={openPermissions(turn.events)}
                      answered={answeredIds(turn.id, turn.events, agent.answered)}
                      onAnswer={(id, allow, always) => agent.answerPermission(turn.id, id, allow, always)}
                    />
                    {live && turn.events.length === 0 ? (
                      <p role="status" className="flex items-center gap-2 text-caption text-fg-3">
                        <span aria-hidden="true" className="size-1.5 animate-dot-pulse rounded-full bg-accent-text" />
                        Starting the sandbox…
                      </p>
                    ) : null}
                    {live && turn.events.length > 0 ? (
                      <p role="status" className="flex items-center gap-2 text-caption text-fg-3">
                        <span aria-hidden="true" className="size-1.5 animate-dot-pulse rounded-full bg-accent-text" />
                        Claude Code is working…
                      </p>
                    ) : null}
                    {changes.length > 0 ? (
                      <ChangesCard
                        changes={changes}
                        base={turn.base}
                        decisions={agent.decisions[turn.id] ?? {}}
                        onAccept={(paths, overwrite) => agent.accept(turn.id, paths, overwrite)}
                        onReject={(paths) => agent.reject(turn.id, paths)}
                      />
                    ) : turn.done && !live && turn.events.length > 0 ? (
                      <p className="flex items-center gap-1.5 text-caption text-fg-3">
                        <Info size={12} aria-hidden="true" />
                        No files changed.
                      </p>
                    ) : null}
                  </section>
                );
              })}
              {agent.error && (
                <div role="alert" className="flex items-start gap-2 rounded-md border border-danger/30 bg-danger-subtle p-2 text-caption text-danger">
                  <AlertCircle size={14} aria-hidden="true" className="mt-0.5 shrink-0" />
                  <span className="wrap-anywhere min-w-0 flex-1">{agent.error.message}</span>
                  {agent.error.action?.kind === "link" && (
                    // Plain anchor on purpose: the IDE needs a full page load, not client navigation.
                    <a href={agent.error.action.href} className={buttonStyles({ variant: "secondary", size: "xs" })}>
                      {agent.error.action.label}
                    </a>
                  )}
                  {agent.error.action?.kind === "retry" && (
                    <Button
                      variant="secondary"
                      size="xs"
                      onClick={agent.retry}
                      disabled={agent.running}
                      leadingIcon={<RotateCw size={12} aria-hidden="true" />}
                    >
                      Retry
                    </Button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
        {showJump && agent.turns.length > 0 && (
          <button
            type="button"
            onClick={scrollToBottom}
            className="absolute bottom-2 left-1/2 flex h-7 -translate-x-1/2 items-center gap-1 rounded-full border border-line-strong bg-elevated px-3 text-caption text-fg shadow-md hover:bg-sunken"
          >
            <ArrowDown size={12} aria-hidden="true" />
            Jump to latest
          </button>
        )}
      </div>

      {empty && agent.error ? (
        <div role="alert" className="mx-3 mb-2 flex items-start gap-2 rounded-md border border-danger/30 bg-danger-subtle p-2 text-caption text-danger">
          <AlertCircle size={14} aria-hidden="true" className="mt-0.5 shrink-0" />
          <span className="wrap-anywhere min-w-0 flex-1">{agent.error.message}</span>
          {agent.error.action?.kind === "link" && (
            <a href={agent.error.action.href} className={buttonStyles({ variant: "secondary", size: "xs" })}>
              {agent.error.action.label}
            </a>
          )}
        </div>
      ) : null}

      <div className="sticky bottom-0 shrink-0 bg-panel p-2">
        <Composer
          value={input}
          onChange={setInput}
          onSubmit={submit}
          placeholder="Tell Claude Code what to do…"
          ariaLabel="Message to Claude Code"
          textareaRef={taRef}
          running={agent.running}
          onStop={agent.stop}
          canSend={!!input.trim() && canSend}
          attachments={files.attachments}
          onAttach={(f) => void files.add(f)}
          onRemoveAttachment={files.remove}
          attachError={files.error}
          commands={commands}
          context={{ used: estimateContextTokens(agent.turns), limit: item?.contextLength ?? DEFAULT_CONTEXT_TOKENS }}
          time={time}
          model={
            combo ? (
              <button
                type="button"
                onClick={() => setComboOpen(true)}
                title={combo.entries.map((e) => e.model).join(" → ")}
                className="flex h-6 max-w-full items-center gap-1 rounded-md bg-accent-subtle px-2 text-caption text-fg focus-visible:outline-2 focus-visible:outline-ring"
              >
                <Layers size={12} aria-hidden="true" className="shrink-0 text-accent-text" />
                <span className="min-w-0 truncate">Combo: {combo.name}</span>
              </button>
            ) : (
              <ModelPicker
                items={items}
                value={selected}
                onChange={(k) => {
                  setSaved(k);
                  try {
                    localStorage.setItem(MODEL_STORAGE_KEY, k);
                  } catch {
                    /* storage blocked */
                  }
                }}
                loading={catalogState === "loading"}
                label="Claude Code model"
              />
            )
          }
          mode={
            <ModeMenu
              value={mode}
              onChange={(m) => {
                setMode(m);
                try {
                  localStorage.setItem(MODE_STORAGE_KEY, m);
                } catch {
                  /* storage blocked */
                }
              }}
            />
          }
        />
      </div>
      <ComboDialog open={comboOpen} onClose={() => setComboOpen(false)} items={items} />
    </div>
  );
}
