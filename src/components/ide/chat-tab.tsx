"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, ArrowDown, Info, Layers, RotateCw, Send, Sparkles, Square } from "lucide-react";
import { MAX_FILE_CONTEXT_CHARS, useAiChat, type ModelChoice } from "@/hooks/use-ai-chat";
import { useFileSystem } from "@/hooks/use-file-system";
import { itemKey, useModelCatalog } from "@/hooks/use-model-catalog";
import { estimateMessagesTokens, estimateTokens } from "@/lib/billing/tokens";
import { orderEntries } from "@/lib/combos";
import { useCombos } from "@/hooks/use-combos";
import { Button, buttonStyles } from "@/components/ui/button";
import { controlClass } from "@/components/ui/field";
import { cn } from "@/lib/cn";
import { ChatMessageView } from "./chat-message";
import { ComboDialog } from "./combo-dialog";
import { ModelPicker } from "./model-picker";
import { emit, useIdeEvent } from "./ide-events";

const money = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmt = (paise: number) => `₹${money.format(paise / 100)}`;

const SUGGESTIONS = ["Explain this file", "Find bugs in this file", "Write tests for this file"];
const MODEL_STORAGE_KEY = "veda:chat-model";
const NEAR_BOTTOM_PX = 80;

function readSavedModel(): string | null {
  try {
    return localStorage.getItem(MODEL_STORAGE_KEY);
  } catch {
    return null;
  }
}

function saveModel(value: string) {
  try {
    localStorage.setItem(MODEL_STORAGE_KEY, value);
  } catch {
    /* storage blocked: the choice is not remembered */
  }
}

export default function ChatTab() {
  const { messages, sendMessage, isStreaming, estimatedCostPaise, error, stop, retry, continueReply, newChat, truncated, draft, clearDraft } =
    useAiChat();
  const { activeFile } = useFileSystem();
  const { items, state: catalogState } = useModelCatalog();
  const [saved, setSaved] = useState<string | null>(readSavedModel);
  const { active: combo } = useCombos();
  const [comboOpen, setComboOpen] = useState(false);
  const [input, setInput] = useState("");
  const [showJump, setShowJump] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const atBottomRef = useRef(true);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const roundRobin = useRef(0);

  // The saved choice wins while it is in the list. Otherwise the first model with a saved key, then the first model.
  const selected = useMemo(() => {
    if (saved && items.some((i) => i.key === saved)) return saved;
    return (items.find((i) => i.keyed)?.key ?? items[0]?.key) || "";
  }, [saved, items]);
  const item = items.find((i) => i.key === selected);

  // Rate-limit countdown from the error time. Send stays disabled until it ends.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!error?.retryAfter) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [error]);
  const cooldown =
    error?.retryAfter && error.at
      ? Math.min(error.retryAfter, Math.max(0, Math.ceil((error.at + error.retryAfter * 1000 - now) / 1000)))
      : 0;

  // Put the text back in the box after a failed send, so the user does not retype it.
  // State is adjusted during render (React pattern), not in an effect.
  if (draft !== null) {
    setInput((cur) => (cur ? cur : draft));
    clearDraft();
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

  // Follow new text only while the reader is near the bottom. Otherwise offer a pill.
  useEffect(() => {
    if (atBottomRef.current) scrollToBottom();
    else setShowJump(true);
  }, [messages, error, truncated, scrollToBottom]);

  // Auto-grow the textarea up to about 8 lines.
  useLayoutEffect(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 188)}px`;
  }, [input]);

  useIdeEvent("veda:focus-chat", () => taRef.current?.focus());
  useIdeEvent("veda:new-chat", ({ tab }) => {
    if (tab === "chat") newChat();
  });

  useEffect(() => {
    emit("veda:chat-status", { model: combo ? combo.name : item?.model, lastCostPaise: estimatedCostPaise });
  }, [item?.model, combo, estimatedCostPaise]);

  // The model that runs first: the single choice, or the first entry of the combo.
  const firstItem = combo
    ? items.find((i) => i.key === itemKey(combo.entries[0].provider, combo.entries[0].model)) ?? item
    : item;
  const rate = firstItem?.rate ?? null;

  // Pre-send estimate with the same token function the server uses. Output is assumed equal to input.
  const fileChars = Math.min(activeFile?.content?.length ?? 0, MAX_FILE_CONTEXT_CHARS);
  const estTokens =
    estimateTokens(input) + Math.ceil(fileChars / 4) + estimateMessagesTokens(messages.slice(-20));
  const preEstimate = rate
    ? Math.ceil((estTokens * (rate.input_paise_per_1k_tokens + rate.output_paise_per_1k_tokens)) / 1000)
    : 0;

  const blocked = cooldown > 0;
  const canSend = !!(combo || item) && !blocked;

  const choice = (): ModelChoice | null => {
    if (combo) {
      const [head, ...rest] = orderEntries(combo, roundRobin.current++);
      return { provider: head.provider, model: head.model, fallbacks: rest };
    }
    return item ? { provider: item.provider, model: item.model } : null;
  };

  const submit = () => {
    const pick = choice();
    if (!input.trim() || isStreaming || !pick || blocked) return;
    const text = input;
    setInput("");
    atBottomRef.current = true;
    void sendMessage(text, pick);
  };

  const suggest = (text: string) => {
    setInput(text);
    taRef.current?.focus();
  };

  const onSelect = (value: string) => {
    setSaved(value);
    saveModel(value);
  };

  const errorText = error
    ? error.retryAfter
      ? cooldown > 0
        ? `${error.message} Try again in ${cooldown} s.`
        : "You can send again."
      : error.message
    : "";

  const lastIsAssistant = messages.length > 0 && messages[messages.length - 1].role === "assistant";

  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      <div className="relative min-h-0 flex-1">
        <div ref={scrollRef} onScroll={onScroll} className="h-full overflow-y-auto overflow-x-hidden px-3 py-3">
          {messages.length === 0 && !error ? (
            <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
              <span className="flex size-10 items-center justify-center rounded-full bg-accent-subtle">
                <Sparkles size={18} aria-hidden="true" className="text-accent-text" />
              </span>
              <p className="text-ui text-fg-2">Ask anything about your code.</p>
              <div className="flex w-full max-w-64 flex-col gap-2">
                {SUGGESTIONS.map((s) => (
                  <Button key={s} variant="secondary" size="sm" className="justify-start" onClick={() => suggest(s)}>
                    {s}
                  </Button>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <div role="log" aria-live="polite" aria-label="Conversation" className="flex flex-col gap-4">
                {messages.map((m, i) => (
                  <ChatMessageView
                    key={i}
                    role={m.role}
                    content={m.content}
                    streaming={isStreaming && i === messages.length - 1 && m.role === "assistant"}
                  />
                ))}
              </div>
              {truncated && !isStreaming && lastIsAssistant && (
                <div className="flex flex-wrap items-center gap-2 rounded-md border border-line bg-sunken p-2 text-caption text-fg-2">
                  <Info size={14} aria-hidden="true" className="shrink-0" />
                  <span className="min-w-0 flex-1">Reply was cut off.</span>
                  <Button variant="secondary" size="xs" onClick={continueReply} disabled={!canSend}>
                    Continue
                  </Button>
                </div>
              )}
              {error && (
                <div role="alert" className="flex items-start gap-2 rounded-md border border-danger/30 bg-danger-subtle p-2 text-caption text-danger">
                  <AlertCircle size={14} aria-hidden="true" className="mt-0.5 shrink-0" />
                  <span className="wrap-anywhere min-w-0 flex-1">{errorText}</span>
                  {error.action?.kind === "link" && (
                    // Plain anchor on purpose: the IDE needs a full page load, not client navigation.
                    <a href={error.action.href} className={buttonStyles({ variant: "secondary", size: "xs" })}>
                      {error.action.label}
                    </a>
                  )}
                  {error.action?.kind === "retry" && (
                    <Button
                      variant="secondary"
                      size="xs"
                      onClick={retry}
                      disabled={isStreaming}
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
        {showJump && messages.length > 0 && (
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

      <div className="sticky bottom-0 shrink-0 border-t border-line bg-panel p-3">
        <div className="mb-2 flex items-center justify-between gap-2 text-caption text-fg-3">
          {rate ? (
            <span className="tnum">Est. next: ~{fmt(preEstimate)}</span>
          ) : (
            <span className="flex items-center gap-1">
              <Info size={12} aria-hidden="true" />
              {catalogState === "loading"
                ? "Loading models…"
                : catalogState === "error"
                  ? "Could not load models. Reload the page."
                  : "No model rate available"}
            </span>
          )}
          {estimatedCostPaise > 0 && <span className="tnum">Last: {fmt(estimatedCostPaise)}</span>}
        </div>
        <textarea
          ref={taRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              // IME: Enter confirms the composed Indic character, not the message.
              // This check must run BEFORE preventDefault, or the composition is cancelled.
              // keyCode 229 covers Safari, which sends Enter after compositionend.
              if (e.nativeEvent.isComposing || e.keyCode === 229) return;
              e.preventDefault();
              submit();
            }
          }}
          rows={2}
          placeholder="Ask about your code…"
          title="Enter to send. Shift+Enter for a new line."
          aria-label="Message"
          className={cn(controlClass, "wrap-anywhere resize-none py-2 leading-relaxed")}
        />
        <div className="mt-2 flex items-center gap-1.5">
          {combo ? (
            <div className="flex h-8 min-w-0 flex-1 items-center gap-1.5 rounded-md border border-accent bg-accent-subtle px-2 text-caption text-fg">
              <Layers size={14} aria-hidden="true" className="shrink-0 text-accent-text" />
              <span className="min-w-0 flex-1 truncate" title={combo.entries.map((e) => e.model).join(" → ")}>
                Combo: {combo.name}
              </span>
            </div>
          ) : (
            <ModelPicker items={items} value={selected} onChange={onSelect} loading={catalogState === "loading"} />
          )}
          <Button
            variant={combo ? "secondary" : "ghost"}
            size="icon-sm"
            aria-label="Model combos"
            title="Model combos"
            aria-pressed={!!combo}
            onClick={() => setComboOpen(true)}
          >
            <Layers size={14} aria-hidden="true" />
          </Button>
          {isStreaming ? (
            <Button variant="danger" size="sm" onClick={stop} leadingIcon={<Square size={14} aria-hidden="true" />}>
              Stop
            </Button>
          ) : (
            <Button
              variant="primary"
              size="sm"
              onClick={submit}
              disabled={!input.trim() || !canSend}
              leadingIcon={<Send size={14} aria-hidden="true" />}
            >
              Send
            </Button>
          )}
        </div>
      </div>
      <ComboDialog open={comboOpen} onClose={() => setComboOpen(false)} items={items} />
    </div>
  );
}
