"use client";

import { useState } from "react";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { cn } from "@/lib/cn";

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

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="Provider" hint="Saving again for the same provider replaces the old key.">
        {(props) => (
          <Select {...props} value={provider} onChange={(e) => setProvider(e.target.value)}>
            {PROVIDERS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <Field label="API key" hint="Encrypted before it is stored. You cannot view it again.">
        {(props) => (
          <Input
            {...props}
            type="password"
            required
            autoComplete="off"
            value={key}
            onChange={(e) => setKey(e.target.value)}
          />
        )}
      </Field>
      <Field label="Label (optional)">
        {(props) => (
          <Input {...props} type="text" value={label} onChange={(e) => setLabel(e.target.value)} />
        )}
      </Field>
      <Button
        type="submit"
        variant="primary"
        size="lg"
        className="w-full sm:h-9 sm:w-auto sm:text-sm"
        loading={busy}
        disabled={key.trim() === ""}
      >
        {busy ? "Saving..." : "Save key"}
      </Button>
      {message ? (
        <p
          role="status"
          className={cn(
            "flex items-start gap-2 text-sm",
            message.kind === "ok" ? "text-success" : "text-danger",
          )}
        >
          {message.kind === "ok" ? (
            <CheckCircle2 size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
          ) : (
            <AlertCircle size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
          )}
          {message.text}
        </p>
      ) : null}
    </form>
  );
}
