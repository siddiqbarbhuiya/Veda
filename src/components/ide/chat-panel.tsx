"use client";

import { useEffect, useRef, useState } from "react";
import { createBrowserClient } from "@/lib/supabase/client";
import { useAiChat } from "@/hooks/use-ai-chat";
import { useFileSystem } from "@/hooks/use-file-system";

interface Rate {
  provider: string;
  model: string;
  input_paise_per_1k_tokens: number;
  output_paise_per_1k_tokens: number;
}

const fmt = (paise: number) => `₹${(paise / 100).toFixed(2)}`;

export default function ChatPanel() {
  const { messages, sendMessage, isStreaming, estimatedCostPaise, error, stop } = useAiChat();
  const { activeFile } = useFileSystem();
  const [rates, setRates] = useState<Rate[]>([]);
  const [selected, setSelected] = useState("");
  const [input, setInput] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

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

  const rate = rates.find((r) => `${r.provider}|${r.model}` === selected);
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

  return (
    <div className="flex h-full flex-col text-xs text-neutral-200">
      <div className="border-b border-neutral-800 p-2">
        <select
          aria-label="Model"
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          className="w-full rounded bg-neutral-800 p-1"
        >
          {rates.map((r) => (
            <option key={`${r.provider}|${r.model}`} value={`${r.provider}|${r.model}`}>
              {r.provider} / {r.model}
            </option>
          ))}
        </select>
      </div>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-2">
        {messages.map((m, i) => (
          <div
            key={i}
            className={`whitespace-pre-wrap rounded p-2 ${m.role === "user" ? "ml-6 bg-blue-900/50" : "mr-6 bg-neutral-800"}`}
          >
            {m.content || (isStreaming && i === messages.length - 1 ? "…" : "")}
          </div>
        ))}
        {error && <div className="rounded bg-red-900/50 p-2 text-red-200">{error}</div>}
        <div ref={endRef} />
      </div>
      <div className="border-t border-neutral-800 p-2">
        <div className="mb-1 flex justify-between text-neutral-500">
          <span>Est. next: ~{fmt(preEstimate)}</span>
          {estimatedCostPaise > 0 && <span>Last: {fmt(estimatedCostPaise)}</span>}
        </div>
        <textarea
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
          rows={3}
          placeholder="Ask about your code…"
          className="w-full resize-none rounded bg-neutral-800 p-1"
        />
        <div className="mt-1 flex justify-end gap-2">
          {isStreaming ? (
            <button onClick={stop} className="rounded bg-red-700 px-3 py-1">
              Stop
            </button>
          ) : (
            <button onClick={submit} disabled={!input.trim() || !rate} className="rounded bg-blue-600 px-3 py-1 disabled:opacity-50">
              Send
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
