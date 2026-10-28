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
}

export function useAiChat() {
  const { activeFile } = useFileSystem();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [estimatedCostPaise, setEstimatedCostPaise] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const messagesRef = useRef<ChatMessage[]>([]);

  const commit = (next: ChatMessage[]) => {
    messagesRef.current = next;
    setMessages(next);
  };

  const sendMessage = useCallback(
    async (content: string, choice: ModelChoice) => {
      if (!content.trim()) return;
      setError(null);
      const history = messagesRef.current;
      const userMsg: ChatMessage = { role: "user", content };
      commit([...history, userMsg, { role: "assistant", content: "" }]);
      setIsStreaming(true);

      const fileContext = activeFile
        ? `The student is editing the file "${activeFile.path}". Its current content:\n\n${activeFile.content ?? ""}`
        : "The student has no file open.";
      const payload: ChatMessage[] = [{ role: "system", content: fileContext }, ...history, userMsg];

      const controller = new AbortController();
      abortRef.current = controller;
      let assistant = "";
      const setAssistant = (text: string) => {
        commit([...messagesRef.current.slice(0, -1), { role: "assistant", content: text }]);
      };

      try {
        const res = await fetch("/api/ai/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ provider: choice.provider, model: choice.model, messages: payload, stream: true }),
          signal: controller.signal,
        });
        if (!res.ok || !res.body) {
          let msg = `Request failed (${res.status})`;
          try {
            const j = await res.json();
            if (j?.error) msg = j.error;
          } catch {}
          throw new Error(msg);
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        const handle = (block: string) => {
          for (const line of block.split("\n")) {
            if (!line.startsWith("data:")) continue;
            let evt: { chunk?: string; done?: boolean; cost_paise?: number; error?: string };
            try {
              evt = JSON.parse(line.slice(5).trim());
            } catch {
              continue;
            }
            if (evt.error) setError(evt.error);
            if (evt.chunk) {
              assistant += evt.chunk;
              setAssistant(assistant);
            }
            if (evt.done && typeof evt.cost_paise === "number") setEstimatedCostPaise(evt.cost_paise);
          }
        };
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const parts = buffer.split("\n\n");
          buffer = parts.pop() ?? "";
          parts.forEach(handle);
        }
        if (buffer.trim()) handle(buffer);
      } catch (err) {
        if ((err as Error).name !== "AbortError") setError((err as Error).message);
      } finally {
        // Drop an empty assistant bubble if nothing arrived.
        if (!assistant) commit(messagesRef.current.slice(0, -1));
        abortRef.current = null;
        setIsStreaming(false);
      }
    },
    [activeFile]
  );

  const stop = useCallback(() => abortRef.current?.abort(), []);

  return { messages, sendMessage, isStreaming, estimatedCostPaise, error, stop };
}
