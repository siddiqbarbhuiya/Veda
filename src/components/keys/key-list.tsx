"use client";

import { useCallback, useEffect, useState } from "react";

type StoredKey = { id: string; provider: string; label: string | null; created_at: string };

const PROVIDER_NAMES: Record<string, string> = { openai: "OpenAI", gemini: "Gemini", anthropic: "Anthropic" };

export default function KeyList({ refreshToken = 0 }: { refreshToken?: number }) {
  const [keys, setKeys] = useState<StoredKey[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/keys");
      if (!res.ok) throw new Error("load failed");
      setKeys((await res.json()) as StoredKey[]);
      setError(null);
    } catch {
      setError("Failed to load keys");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, refreshToken]);

  const remove = async (id: string) => {
    const res = await fetch(`/api/keys/${id}`, { method: "DELETE" });
    if (res.ok) {
      setKeys((prev) => (prev ?? []).filter((k) => k.id !== id));
    } else {
      setError("Failed to delete key");
    }
  };

  if (error) return <p className="text-sm text-red-400">{error}</p>;
  if (keys === null) return <p className="text-sm text-neutral-400">Loading...</p>;
  if (keys.length === 0) return <p className="text-sm text-neutral-400">No keys saved.</p>;

  return (
    <ul className="space-y-2">
      {keys.map((k) => (
        <li key={k.id} className="flex items-center justify-between rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm">
          <div>
            <div className="font-medium">{PROVIDER_NAMES[k.provider] ?? k.provider}</div>
            <div className="text-xs text-neutral-400">
              {k.label ? `${k.label} · ` : ""}
              {new Date(k.created_at).toLocaleDateString()}
            </div>
          </div>
          <button onClick={() => remove(k.id)} className="rounded px-2 py-1 text-red-400 hover:bg-neutral-800">
            Delete
          </button>
        </li>
      ))}
    </ul>
  );
}
