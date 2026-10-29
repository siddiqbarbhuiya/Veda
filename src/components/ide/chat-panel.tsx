"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { AlertCircle, Info, Send, Sparkles, Square } from "lucide-react";
import { createBrowserClient } from "@/lib/supabase/client";
import { useAiChat } from "@/hooks/use-ai-chat";
import { useFileSystem } from "@/hooks/use-file-system";
import { Button } from "@/components/ui/button";
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
const modelLabel = (r: Rate) => `${PROVIDERS[r.provider] ?? r.provider} · ${r.model}`;

const SUGGESTIONS = ["Explain this file", "Find bugs in this file", "Write tests for this file"];

export default function ChatPanel() {
  const { messages, sendMessage, isStreaming, estimatedCostPaise, error, stop } = useAiChat();
  const { activeFile } = useFileSystem();
  const [rates, setRates] = useState<Rate[]>([]);
  const [selected, setSelected] = useState("");
  const [input, setInput] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    let cancelled = false;
    createBrowserClient()
      .from("rate_config")
      .select("provider, model, input_paise_per_1k_tokens, output_paise_per_1k_tokens")
      .eq("is_active", true)
      .then(({ data }) => {
        if (cancelled || !data) return;
        setRates(data as Rate[]);
        if (data.length) setSelected(`${data[0].provider}|${data[0].model}`);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView?.({ behavior: "smooth" });
  }, [messages]);

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

  // Rough pre-send estimate: ~4 chars per token, output assumed equal to input.
  const chars = input.length + (activeFile?.content?.length ?? 0) + messages.reduce((n, m) => n + m.content.length, 0);
  const estTokens = Math.ceil(chars / 4);
  const preEstimate = rate
    ? Math.ceil((estTokens * (rate.input_paise_per_1k_tokens + rate.output_paise_per_1k_tokens)) / 1000)
    : 0;

  const submit = () => {
    if (!input.trim() || isStreaming || !rate) return;
    const text = input;
    setInput("");
    void sendMessage(text, { provider: rate.provider, model: rate.model });
  };

  const suggest = (text: string) => {
    setInput(text);
    taRef.current?.focus();
  };

  return (
    <div className="flex h-full min-h-0 w-full flex-col bg-panel text-fg">
      <div className="flex h-9 shrink-0 items-center justify-between gap-2 border-b border-line pl-3 pr-2">
        <h2 className="flex items-center gap-1.5 text-ui font-medium text-fg">
          <Sparkles size={14} aria-hidden="true" className="text-accent-text" />
          AI Assistant
        </h2>
        <div className="w-44 min-w-0 max-w-[60%]">
          <Select
            aria-label="Model"
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            className="h-7! px-2! pr-7! text-caption! sm:h-7! sm:text-caption!"
          >
            {rates.map((r) => (
              <option key={`${r.provider}|${r.model}`} value={`${r.provider}|${r.model}`}>
                {modelLabel(r)}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-3 py-3">
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
            {messages.map((m, i) => (
              <ChatMessageView key={i} role={m.role} content={m.content} streaming={isStreaming && i === messages.length - 1 && m.role === "assistant"} />
            ))}
            {error && (
              <div role="alert" className="flex items-start gap-2 rounded-md border border-danger/30 bg-danger-subtle p-2 text-caption text-danger">
                <AlertCircle size={14} aria-hidden="true" className="mt-0.5 shrink-0" />
                <span className="wrap-anywhere min-w-0">{error}</span>
              </div>
            )}
          </div>
        )}
        <div ref={endRef} />
      </div>

      <div className="sticky bottom-0 shrink-0 border-t border-line bg-panel p-3">
        <div className="mb-2 flex items-center justify-between gap-2 text-caption text-fg-3">
          {rate ? (
            <span className="tnum">Est. next: ~{fmt(preEstimate)}</span>
          ) : (
            <span className="flex items-center gap-1">
              <Info size={12} aria-hidden="true" /> No model rate available
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
              if (e.nativeEvent.isComposing) return;
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
            <Button variant="primary" size="sm" onClick={submit} disabled={!input.trim() || !rate} leadingIcon={<Send size={14} aria-hidden="true" />}>
              Send
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
