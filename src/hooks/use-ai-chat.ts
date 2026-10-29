"use client";

import { useCallback, useRef, useState } from "react";
import { useFileSystem } from "@/hooks/use-file-system";

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface ModelChoice {
  provider: string;
  model: string;
  /** Models to try, in order, when this one hits a limit or a server error before any text. */
  fallbacks?: { provider: string; model: string }[];
}

/** What the user can do about an error. Links are plain anchors: the IDE needs a full page load. */
export type ChatErrorAction =
  | { kind: "link"; label: string; href: string }
  | { kind: "retry" }
  /** Claude Code only: stop the run that is still going, then send the request again. */
  | { kind: "stop_retry"; run: string };

export interface ChatError {
  message: string;
  code?: string;
  action?: ChatErrorAction;
  /** Seconds to wait before the next send (rate limits). */
  retryAfter?: number;
  /** Time the error was set (ms since epoch). Used for the countdown. */
  at?: number;
}

/** Window event name that tells the toolbar to reload the wallet balance. */
export const BALANCE_CHANGED_EVENT = "veda:balance-changed";

export const MAX_FILE_CONTEXT_CHARS = 20_000;
export const MAX_HISTORY_MESSAGES = 20;
// Stay well below the server limit of 200,000 characters per request.
const MAX_HISTORY_CHARS = 120_000;

function notifyBalanceChanged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(BALANCE_CHANGED_EVENT));
}

/** Map an API error code and status to a friendly message with an action. */
export function describeChatError(
  status: number,
  code: string | undefined,
  serverMessage: string | undefined,
  retryAfter?: number,
): ChatError {
  const c = code ?? (status === 401 ? "unauthenticated" : status === 402 ? "insufficient_balance" : status === 413 ? "payload_too_large" : status === 429 ? "rate_limited" : undefined);
  switch (c) {
    case "unauthenticated":
      return { code: c, message: "You are signed out.", action: { kind: "link", label: "Sign in again", href: "/login" } };
    case "no_api_key":
      return {
        code: c,
        message: "No API key is saved for this model's provider.",
        action: { kind: "link", label: "Add your API key", href: "/dashboard" },
      };
    case "insufficient_balance":
      return {
        code: c,
        message: "Your balance is too low for this message.",
        action: { kind: "link", label: "Add credits", href: "/dashboard?topup=1" },
      };
    case "rate_limited":
    case "provider_rate_limit": {
      const wait = retryAfter && retryAfter > 0 ? Math.ceil(retryAfter) : 30;
      return { code: c, message: "Too many requests.", retryAfter: wait };
    }
    case "provider_auth":
      return {
        code: c,
        message: serverMessage || "Your key was rejected. Check the key in your dashboard.",
        action: { kind: "link", label: "Open dashboard", href: "/dashboard" },
      };
    case "payload_too_large":
    case "too_many_messages":
      return { code: c, message: "Message too long. Shorten it, or start a new chat." };
    case "model_unsupported":
      return { code: c, message: "This model is not available. Pick another model." };
    default:
      break;
  }
  if (status >= 500 || c === "provider_error" || c === "billing_unavailable" || c === "service_unavailable" || c === "server_error") {
    return { code: c, message: serverMessage || `The service had a problem (${status}).`, action: { kind: "retry" } };
  }
  return { code: c, message: serverMessage || `Request failed (${status})` };
}

function trimHistory(history: ChatMessage[]): ChatMessage[] {
  let out = history.slice(-MAX_HISTORY_MESSAGES);
  const chars = (list: ChatMessage[]) => list.reduce((n, m) => n + m.content.length, 0);
  while (out.length > 1 && chars(out) > MAX_HISTORY_CHARS) out = out.slice(1);
  // The conversation must start with a user message.
  while (out.length > 0 && out[0].role !== "user") out = out.slice(1);
  return out;
}

function buildFileContext(file: { path: string; content?: string } | null | undefined): string {
  if (!file) return "The student has no file open.";
  const content = file.content ?? "";
  if (content.length <= MAX_FILE_CONTEXT_CHARS) {
    return `The student is editing the file "${file.path}". Its current content:\n\n${content}`;
  }
  return (
    `The student is editing the file "${file.path}". Its content is cut off: only the first ` +
    `${MAX_FILE_CONTEXT_CHARS.toLocaleString("en-US")} of ${content.length.toLocaleString("en-US")} characters are included:\n\n` +
    content.slice(0, MAX_FILE_CONTEXT_CHARS)
  );
}

const COMPACT_PROMPT =
  "Summarize our conversation so far in under 200 words. Keep the facts, the decisions and the names of any code we need to continue.";

/** Read an SSE reply to the end and return its text. An `error` event becomes a ChatError. */
async function readReplyText(body: ReadableStream<Uint8Array>): Promise<{ text: string; failed: ChatError | null }> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";
  let failed: ChatError | null = null;
  const handle = (block: string) => {
    for (const line of block.split("\n")) {
      if (!line.startsWith("data:")) continue;
      try {
        const evt = JSON.parse(line.slice(5).trim()) as { chunk?: string; error?: string; code?: string; retry_after?: number };
        if (evt.error) failed = describeChatError(502, evt.code ?? "provider_error", evt.error, evt.retry_after);
        if (evt.chunk) text += evt.chunk;
      } catch {
        /* not JSON */
      }
    }
  };
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer = (buffer + decoder.decode(value, { stream: true })).replace(/\r\n/g, "\n");
    const parts = buffer.split("\n\n");
    buffer = parts.pop() ?? "";
    parts.forEach(handle);
  }
  buffer += decoder.decode();
  if (buffer.trim()) handle(buffer);
  return { text, failed };
}

export function useAiChat() {
  const { activeFile } = useFileSystem();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [estimatedCostPaise, setEstimatedCostPaise] = useState(0);
  const [error, setError] = useState<ChatError | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [draft, setDraft] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const messagesRef = useRef<ChatMessage[]>([]);
  const lastSendRef = useRef<{ content: string; choice: ModelChoice } | null>(null);
  // Bumps on "New chat" so a stream that was aborted cannot touch the new conversation.
  const genRef = useRef(0);

  const commit = (next: ChatMessage[]) => {
    messagesRef.current = next;
    setMessages(next);
  };

  const sendMessage = useCallback(
    async (content: string, choice: ModelChoice) => {
      // Re-entrancy guard: a second Enter before the re-render must not start a second stream.
      if (abortRef.current) return;
      if (!content.trim()) return;
      const controller = new AbortController();
      abortRef.current = controller;
      const gen = ++genRef.current;
      const stale = () => gen !== genRef.current;

      lastSendRef.current = { content, choice };
      setError(null);
      setDraft(null);
      setTruncated(false);

      const prior = messagesRef.current;
      const userMsg: ChatMessage = { role: "user", content };
      commit([...prior, userMsg, { role: "assistant", content: "" }]);
      setIsStreaming(true);

      const payload: ChatMessage[] = [
        { role: "system", content: buildFileContext(activeFile) },
        ...trimHistory(prior),
        userMsg,
      ];

      let assistant = "";
      // Holder object: closures below write to it, and TypeScript must not narrow it.
      const r: { fail: ChatError | null; finishReason?: string } = { fail: null };
      let aborted = false;
      let started = false;
      const setAssistant = (text: string) => {
        if (stale()) return;
        commit([...messagesRef.current.slice(0, -1), { role: "assistant", content: text }]);
      };

      try {
        const res = await fetch("/api/ai/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            provider: choice.provider,
            model: choice.model,
            messages: payload,
            stream: true,
            ...(choice.fallbacks && choice.fallbacks.length > 0 ? { fallbacks: choice.fallbacks } : {}),
          }),
          signal: controller.signal,
        });
        if (!res.ok || !res.body) {
          let body: { error?: string; code?: string; retry_after?: number } = {};
          try {
            body = await res.json();
          } catch {
            /* not JSON */
          }
          const header = Number(res.headers.get("Retry-After"));
          r.fail = describeChatError(res.status, body.code, body.error, body.retry_after ?? (header > 0 ? header : undefined));
          return;
        }
        started = true;
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        const handle = (block: string) => {
          for (const line of block.split("\n")) {
            if (!line.startsWith("data:")) continue;
            let evt: {
              chunk?: string;
              done?: boolean;
              cost_paise?: number;
              error?: string;
              code?: string;
              retry_after?: number;
              finish_reason?: string;
            };
            try {
              evt = JSON.parse(line.slice(5).trim());
            } catch {
              continue;
            }
            if (evt.error) r.fail = describeChatError(502, evt.code ?? "provider_error", evt.error, evt.retry_after);
            if (evt.chunk) {
              assistant += evt.chunk;
              setAssistant(assistant);
            }
            if (evt.finish_reason) r.finishReason = evt.finish_reason;
            if (evt.done && typeof evt.cost_paise === "number" && !stale()) setEstimatedCostPaise(evt.cost_paise);
          }
        };
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          // Accept \r\n\r\n as an event separator (a lone \r at a chunk end joins the next chunk).
          buffer = (buffer + decoder.decode(value, { stream: true })).replace(/\r\n/g, "\n");
          const parts = buffer.split("\n\n");
          buffer = parts.pop() ?? "";
          parts.forEach(handle);
        }
        buffer = (buffer + decoder.decode()).replace(/\r\n/g, "\n");
        if (buffer.trim()) handle(buffer);

        if (!assistant && !r.fail) {
          r.fail = { code: "empty_reply", message: "The model returned no text. Try again, or pick another model.", action: { kind: "retry" } };
        }
      } catch (err) {
        if ((err as Error).name === "AbortError") aborted = true;
        else
          r.fail = {
            code: "network",
            message: "Network problem. Check your connection and try again.",
            action: { kind: "retry" },
          };
      } finally {
        if (abortRef.current === controller) abortRef.current = null;
        if (!stale()) {
          if (!assistant) {
            // Hard failure: remove the dangling user message and the empty bubble.
            commit(prior);
            if (aborted || (r.fail && r.fail.action?.kind !== "retry")) setDraft(content);
          }
          if (r.fail) setError({ ...r.fail, at: Date.now() });
          if (r.finishReason && /^(length|max_tokens)$/i.test(r.finishReason)) setTruncated(true);
          setIsStreaming(false);
        }
        if (started) {
          notifyBalanceChanged();
          // After Stop the server settles a moment later: refresh again.
          if (aborted) setTimeout(notifyBalanceChanged, 1500);
        }
      }
    },
    [activeFile],
  );

  /**
   * Replace the conversation with a short summary, so later messages carry less context.
   * The summary is asked from the same model. The history becomes a summary message and an acknowledgement.
   */
  const compact = useCallback(async (choice: ModelChoice) => {
    if (abortRef.current || messagesRef.current.length < 2) return;
    const controller = new AbortController();
    abortRef.current = controller;
    const gen = ++genRef.current;
    const stale = () => gen !== genRef.current;
    setError(null);
    setTruncated(false);
    setIsStreaming(true);
    let started = false;
    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: choice.provider,
          model: choice.model,
          messages: [...trimHistory(messagesRef.current), { role: "user", content: COMPACT_PROMPT }],
          stream: true,
          ...(choice.fallbacks && choice.fallbacks.length > 0 ? { fallbacks: choice.fallbacks } : {}),
        }),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) {
        let body: { error?: string; code?: string; retry_after?: number } = {};
        try {
          body = await res.json();
        } catch {
          /* not JSON */
        }
        const header = Number(res.headers.get("Retry-After"));
        const failure = describeChatError(res.status, body.code, body.error, body.retry_after ?? (header > 0 ? header : undefined));
        // "Retry" would send the last message again, which is not what the student asked for.
        if (!stale()) setError({ ...failure, action: failure.action?.kind === "retry" ? undefined : failure.action, at: Date.now() });
        return;
      }
      started = true;
      const { text, failed } = await readReplyText(res.body);
      if (stale()) return;
      if (failed) {
        setError({ ...failed, action: undefined, at: Date.now() });
        return;
      }
      if (!text.trim()) {
        setError({ code: "empty_reply", message: "The model returned no summary. Try again, or pick another model.", at: Date.now() });
        return;
      }
      commit([
        { role: "user", content: `Summary of our conversation so far:\n\n${text.trim()}` },
        { role: "assistant", content: "Understood. I will continue from this summary." },
      ]);
    } catch (err) {
      if ((err as Error).name !== "AbortError" && !stale()) {
        setError({ code: "network", message: "Network problem. Check your connection and try again.", at: Date.now() });
      }
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      if (!stale()) setIsStreaming(false);
      if (started) notifyBalanceChanged();
    }
  }, []);

  const stop = useCallback(() => abortRef.current?.abort(), []);

  const retry = useCallback(() => {
    const last = lastSendRef.current;
    if (last) void sendMessage(last.content, last.choice);
  }, [sendMessage]);

  const continueReply = useCallback(() => {
    const last = lastSendRef.current;
    if (last) void sendMessage("Continue", last.choice);
  }, [sendMessage]);

  const newChat = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    genRef.current++;
    messagesRef.current = [];
    setMessages([]);
    setIsStreaming(false);
    setError(null);
    setTruncated(false);
    setDraft(null);
  }, []);

  const clearDraft = useCallback(() => setDraft(null), []);

  return {
    messages,
    sendMessage,
    isStreaming,
    estimatedCostPaise,
    error,
    stop,
    retry,
    continueReply,
    compact,
    newChat,
    truncated,
    draft,
    clearDraft,
  };
}
