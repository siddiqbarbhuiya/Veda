"use client";

import { useState } from "react";

const PROVIDERS = [
  { value: "openai", label: "OpenAI" },
  { value: "gemini", label: "Gemini" },
  { value: "anthropic", label: "Anthropic" },
];

export default function KeyForm({ onSaved }: { onSaved?: () => void }) {
  const [provider, setProvider] = useState("openai");
  const [key, setKey] = useState("");
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, key, label: label || undefined }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setMessage({ kind: "error", text: data.error ?? "Failed to save key" });
        return;
      }
      setKey("");
      setLabel("");
      setMessage({ kind: "ok", text: "Key saved" });
      onSaved?.();
    } catch {
      setMessage({ kind: "error", text: "Failed to save key" });
    } finally {
      setBusy(false);
    }
  };

  const field = "w-full rounded border border-neutral-700 bg-neutral-900 px-2 py-1.5 text-sm";

  return (
    <form onSubmit={submit} className="space-y-3">
      <label className="block text-sm">
        <span className="mb-1 block text-neutral-400">Provider</span>
        <select value={provider} onChange={(e) => setProvider(e.target.value)} className={field}>
          {PROVIDERS.map((p) => (
            <option key={p.value} value={p.value}>{p.label}</option>
          ))}
        </select>
      </label>
      <label className="block text-sm">
        <span className="mb-1 block text-neutral-400">API key</span>
        <input type="password" required autoComplete="off" value={key} onChange={(e) => setKey(e.target.value)} className={field} />
      </label>
      <label className="block text-sm">
        <span className="mb-1 block text-neutral-400">Label (optional)</span>
        <input type="text" value={label} onChange={(e) => setLabel(e.target.value)} className={field} />
      </label>
      <button
        type="submit"
        disabled={busy || key.trim() === ""}
        className="rounded bg-emerald-600 px-3 py-1.5 text-sm text-white hover:bg-emerald-500 disabled:opacity-50"
      >
        {busy ? "Saving..." : "Save key"}
      </button>
      {message && (
        <p role="status" className={`text-sm ${message.kind === "ok" ? "text-emerald-400" : "text-red-400"}`}>
          {message.text}
        </p>
      )}
    </form>
  );
}
