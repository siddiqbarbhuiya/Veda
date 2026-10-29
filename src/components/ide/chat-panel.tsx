"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { AlertCircle, ArrowDown, Info, RotateCw, Send, Sparkles, SquarePen, Square } from "lucide-react";
import { createBrowserClient } from "@/lib/supabase/client";
import { MAX_FILE_CONTEXT_CHARS, useAiChat } from "@/hooks/use-ai-chat";
import { useFileSystem } from "@/hooks/use-file-system";
import { estimateMessagesTokens, estimateTokens } from "@/lib/billing/tokens";
import { Button, buttonStyles } from "@/components/ui/button";
import { Select, controlClass } from "@/components/ui/field";
import { cn } from "@/lib/cn";
import { ChatMessageView } from "./chat-message";
import { emit, useIdeEvent } from "./ide-events";

interface Rate {
  provider: string;
  model: string;
  input_paise_per_1k_tokens: number;
  output_paise_per_1k_tokens: number;
}

const money = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmt = (paise: number) => `₹${money.format(paise / 100)}`;

const PROVIDERS: Record<string, string> = { openai: "OpenAI", gemini: "Gemini", anthropic: "Anthropic" };
const modelLabel = (r: Rate, keyed: Set<string> | null) =>
  `${PROVIDERS[r.provider] ?? r.provider} · ${r.model}${keyed && !keyed.has(r.provider) ? " (no key)" : ""}`;

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

export default function ChatPanel() {
  const { messages, sendMessage, isStreaming, estimatedCostPaise, error, stop, retry, continueReply, newChat, truncated, draft, clearDraft } =
    useAiChat();
  const { activeFile } = useFileSystem();
  const [rates, setRates] = useState<Rate[]>([]);
  const [ratesState, setRatesState] = useState<"loading" | "ready" | "error">("loading");
  const [keyed, setKeyed] = useState<Set<string> | null>(null);
  const [selected, setSelected] = useState("");
  const [input, setInput] = useState("");
  const [showJump, setShowJump] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const atBottomRef = useRef(true);
  const taRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    let cancelled = false;
    createBrowserClient()
      .from("rate_config")
      .select("provider, model, input_paise_per_1k_tokens, output_paise_per_1k_tokens")
      .eq("is_active", true)
      .order("provider")
      .order("model")
      .then(({ data, error: loadError }) => {
        if (cancelled) return;
        if (loadError || !data) {
          setRatesState("error");
          return;
        }
        const list = data as Rate[];
        setRates(list);
        setRatesState("ready");
        const saved = readSavedModel();
        const pick = list.find((r) => `${r.provider}|${r.model}` === saved) ?? list[0];
        if (pick) setSelected(`${pick.provider}|${pick.model}`);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Read the saved keys once to mark models that have no key. Errors are ignored.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/keys")
      .then((res) => (res.ok ? res.json() : null))
      .then((rows: { provider?: string }[] | null) => {
        if (cancelled || !Array.isArray(rows)) return;
        setKeyed(new Set(rows.map((r) => r.provider).filter((p): p is string => typeof p === "string")));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

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

  const rate = rates.find((r) => `${r.provider}|${r.model}` === selected);

  useEffect(() => {
    emit("veda:chat-status", { model: rate?.model, lastCostPaise: estimatedCostPaise });
  }, [rate?.model, estimatedCostPaise]);

  // Pre-send estimate with the same token function the server uses. Output is assumed equal to input.
  const fileChars = Math.min(activeFile?.content?.length ?? 0, MAX_FILE_CONTEXT_CHARS);
  const estTokens =
    estimateTokens(input) + Math.ceil(fileChars / 4) + estimateMessagesTokens(messages.slice(-20));
  const preEstimate = rate
    ? Math.ceil((estTokens * (rate.input_paise_per_1k_tokens + rate.output_paise_per_1k_tokens)) / 1000)
    : 0;

  const blocked = cooldown > 0;

  const submit = () => {
    if (!input.trim() || isStreaming || !rate || blocked) return;
    const text = input;
    setInput("");
    atBottomRef.current = true;
    void sendMessage(text, { provider: rate.provider, model: rate.model });
  };

  const suggest = (text: string) => {
    setInput(text);
    taRef.current?.focus();
  };

  const onSelect = (value: string) => {
    setSelected(value);
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
    <div className="flex h-full min-h-0 w-full flex-col bg-panel text-fg">
      <div className="flex h-9 shrink-0 items-center justify-between gap-2 border-b border-line pl-3 pr-2">
        <h2 className="flex items-center gap-1.5 text-ui font-medium text-fg">
          <Sparkles size={14} aria-hidden="true" className="text-accent-text" />
          AI Assistant
        </h2>
        <div className="flex min-w-0 max-w-[70%] items-center gap-1">
          <div className="w-44 min-w-0">
            <Select
              aria-label="Model"
              value={selected}
              onChange={(e) => onSelect(e.target.value)}
              className="h-7! px-2! pr-7! text-caption! sm:h-7! sm:text-caption!"
            >
              {rates.map((r) => (
                <option key={`${r.provider}|${r.model}`} value={`${r.provider}|${r.model}`}>
                  {modelLabel(r, keyed)}
                </option>
              ))}
            </Select>
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="New chat"
            title="New chat"
            onClick={newChat}
            disabled={messages.length === 0 && !isStreaming}
          >
            <SquarePen size={14} aria-hidden="true" />
          </Button>
        </div>
      </div>

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
                  <Button variant="secondary" size="xs" onClick={continueReply} disabled={!rate || blocked}>
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
              {ratesState === "loading"
                ? "Loading models…"
                : ratesState === "error"
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
          aria-label="Message"
          className={cn(controlClass, "wrap-anywhere resize-none py-2 leading-relaxed")}
        />
        <div className="mt-2 flex items-center justify-between gap-2">
          <span className="text-caption text-fg-3">Shift+Enter for a new line</span>
          {isStreaming ? (
            <Button variant="danger" size="sm" onClick={stop} leadingIcon={<Square size={14} aria-hidden="true" />}>
              Stop
            </Button>
          ) : (
            <Button
              variant="primary"
              size="sm"
              onClick={submit}
              disabled={!input.trim() || !rate || blocked}
              leadingIcon={<Send size={14} aria-hidden="true" />}
            >
              Send
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
