"use client";

import { useState } from "react";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { apiFetch } from "@/lib/api-fetch";
import { cn } from "@/lib/cn";
import { KEY_PROVIDERS, MAX_KEY_LENGTH, MAX_LABEL_LENGTH, URL_PROVIDERS, providerName } from "@/lib/key-providers";

export default function KeyForm({ onSaved }: { onSaved?: () => void }) {
  const [provider, setProvider] = useState<string>(KEY_PROVIDERS[0].value);
  const [key, setKey] = useState("");
  const [label, setLabel] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const keyValue = key.trim();
    const labelValue = label.trim();
    const needsUrl = URL_PROVIDERS.includes(provider);
    if (keyValue === "" || busy || (needsUrl && baseUrl.trim() === "")) return;
    if (keyValue.length > MAX_KEY_LENGTH) {
      setMessage({ kind: "error", text: `The key can have at most ${MAX_KEY_LENGTH} characters.` });
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const res = await apiFetch("/api/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, key: keyValue, label: labelValue || undefined, ...(needsUrl ? { baseUrl: baseUrl.trim() } : {}) }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setMessage({ kind: "error", text: data.error ?? "Could not save the key. Try again." });
        return;
      }
      const data = (await res.json().catch(() => ({}))) as { replaced?: boolean };
      setKey("");
      setLabel("");
      setBaseUrl("");
      setMessage({
        kind: "ok",
        text: data.replaced ? `${providerName(provider)} key replaced.` : `${providerName(provider)} key saved.`,
      });
      onSaved?.();
    } catch {
      setMessage({ kind: "error", text: "Could not save the key. Try again." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="Provider" hint="Saving again for the same provider replaces the old key.">
        {(props) => (
          <Select
            {...props}
            value={provider}
            onChange={(e) => {
              setProvider(e.target.value);
              setMessage(null);
            }}
          >
            {KEY_PROVIDERS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </Select>
        )}
      </Field>
      {URL_PROVIDERS.includes(provider) ? (
        <Field
          label="OmniRoute address"
          hint="The address of your own OmniRoute, for example https://omniroute.example.com. Each person runs their own and makes their own combos. See docs/setup/omniroute.md."
        >
          {(props) => (
            <Input
              {...props}
              type="url"
              name="base-url"
              required
              maxLength={200}
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              placeholder="https://omniroute.example.com"
              value={baseUrl}
              onChange={(e) => {
                setBaseUrl(e.target.value);
                setMessage(null);
              }}
            />
          )}
        </Field>
      ) : null}
      <Field label="API key" hint="Encrypted before it is stored. You cannot view it again.">
        {(props) => (
          <Input
            {...props}
            type="password"
            name="api-key"
            required
            maxLength={MAX_KEY_LENGTH}
            autoComplete="new-password"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            data-1p-ignore
            data-lpignore="true"
            value={key}
            onChange={(e) => {
              setKey(e.target.value);
              setMessage(null);
            }}
          />
        )}
      </Field>
      <Field label="Label (optional)">
        {(props) => (
          <Input
            {...props}
            type="text"
            name="key-label"
            maxLength={MAX_LABEL_LENGTH}
            autoComplete="off"
            data-1p-ignore
            data-lpignore="true"
            value={label}
            onChange={(e) => {
              setLabel(e.target.value);
              setMessage(null);
            }}
          />
        )}
      </Field>
      <Button
        type="submit"
        variant="primary"
        size="lg"
        className="w-full sm:h-9 sm:w-auto sm:text-sm"
        loading={busy}
        disabled={key.trim() === "" || (URL_PROVIDERS.includes(provider) && baseUrl.trim() === "")}
      >
        {busy ? "Saving..." : "Save key"}
      </Button>
      {/* The live region is always mounted, so screen readers announce the text when it changes. */}
      <div aria-live="polite">
        {message ? (
          <p
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
      </div>
    </form>
  );
}
