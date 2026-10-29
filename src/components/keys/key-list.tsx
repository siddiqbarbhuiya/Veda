"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertCircle, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDate } from "@/components/dashboard/format";

type StoredKey = { id: string; provider: string; label: string | null; created_at: string };

const PROVIDER_NAMES: Record<string, string> = { openai: "OpenAI", gemini: "Gemini", anthropic: "Anthropic" };

function providerName(provider: string): string {
  return PROVIDER_NAMES[provider] ?? provider;
}

export default function KeyList({ refreshToken = 0 }: { refreshToken?: number }) {
  const [keys, setKeys] = useState<StoredKey[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<StoredKey | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(() => {
    return fetch("/api/keys")
      .then(async (res) => {
        if (!res.ok) throw new Error("load failed");
        setKeys((await res.json()) as StoredKey[]);
        setError(null);
      })
      .catch(() => {
        setError("Failed to load keys");
      });
  }, []);

  useEffect(() => {
    void load();
  }, [load, refreshToken]);

  const remove = async (id: string) => {
    setDeleting(true);
    setDeleteError(null);
    try {
      const res = await fetch(`/api/keys/${id}`, { method: "DELETE" });
      if (res.ok) {
        setKeys((prev) => (prev ?? []).filter((k) => k.id !== id));
      } else {
        setDeleteError("Failed to delete key");
      }
    } catch {
      setDeleteError("Failed to delete key");
    } finally {
      setDeleting(false);
      setPendingDelete(null);
    }
  };

  if (error) {
    return (
      <div className="flex flex-col items-start gap-3 p-6">
        <p role="alert" className="flex items-center gap-2 text-sm text-danger">
          <AlertCircle size={16} aria-hidden="true" />
          {error}
        </p>
        <Button size="sm" onClick={() => void load()}>
          Try again
        </Button>
      </div>
    );
  }

  if (keys === null) {
    return (
      <div role="status" className="divide-y divide-line">
        <span className="sr-only">Loading...</span>
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex items-center gap-3 p-4">
            <Skeleton className="size-9 rounded-md" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3.5 w-1/3" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (keys.length === 0) {
    return (
      <div className="flex flex-col items-center px-6 py-12 text-center">
        <span className="flex size-12 items-center justify-center rounded-full bg-accent-subtle text-accent-text">
          <KeyRound size={24} aria-hidden="true" />
        </span>
        <p className="mt-4 text-sm font-medium text-fg">No keys saved.</p>
        <p className="mt-1 max-w-xs text-sm text-fg-2">
          Add your first API key to start coding with AI.
        </p>
      </div>
    );
  }

  return (
    <>
      {deleteError ? (
        <p role="alert" className="flex items-center gap-2 border-b border-line p-4 text-sm text-danger">
          <AlertCircle size={16} aria-hidden="true" />
          {deleteError}
        </p>
      ) : null}
      <ul className="divide-y divide-line">
        {keys.map((k) => (
          <li key={k.id} className="flex items-center gap-3 p-4">
            <span
              aria-hidden="true"
              className="flex size-9 shrink-0 items-center justify-center rounded-md bg-accent-subtle font-display text-sm font-semibold text-accent-text"
            >
              {providerName(k.provider).charAt(0).toUpperCase()}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-fg">{providerName(k.provider)}</p>
              <p className="tnum truncate text-caption text-fg-3">
                {k.label ? `${k.label} · ` : ""}
                Added {formatDate(k.created_at)}
              </p>
            </div>
            <Button
              variant="danger"
              size="md"
              className="min-h-11 sm:min-h-0"
              aria-label={`Delete ${providerName(k.provider)} key`}
              onClick={() => setPendingDelete(k)}
            >
              Delete
            </Button>
          </li>
        ))}
      </ul>

      <Dialog
        open={pendingDelete !== null}
        onClose={() => setPendingDelete(null)}
        title="Delete this key?"
        description={
          pendingDelete
            ? `The ${providerName(pendingDelete.provider)} key is removed from Veda. AI requests with it stop working.`
            : undefined
        }
        className="max-w-md"
      >
        <div className="flex justify-end gap-2">
          <Button variant="secondary" size="lg" className="sm:h-9 sm:text-sm" onClick={() => setPendingDelete(null)}>
            Cancel
          </Button>
          <Button
            variant="danger"
            size="lg"
            className="sm:h-9 sm:text-sm"
            loading={deleting}
            onClick={() => pendingDelete && void remove(pendingDelete.id)}
          >
            Delete key
          </Button>
        </div>
      </Dialog>
    </>
  );
}
