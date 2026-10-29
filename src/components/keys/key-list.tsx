"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDate } from "@/components/dashboard/format";
import { apiFetch } from "@/lib/api-fetch";
import { providerName } from "@/lib/key-providers";

type StoredKey = {
  id: string;
  provider: string;
  label: string | null;
  created_at: string;
  updated_at?: string | null;
};

function wasReplaced(k: StoredKey): boolean {
  if (!k.updated_at) return false;
  return new Date(k.updated_at).getTime() - new Date(k.created_at).getTime() > 1000;
}

export default function KeyList({ refreshToken = 0 }: { refreshToken?: number }) {
  const [keys, setKeys] = useState<StoredKey[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  // Kept after the dialog closes so its text does not blank out during the close animation.
  const [target, setTarget] = useState<StoredKey | null>(null);
  const [deleting, setDeleting] = useState(false);
  const requestId = useRef(0);

  // Only the newest load may write state. A failed refresh keeps the list that is already shown.
  const load = useCallback(async () => {
    const id = ++requestId.current;
    try {
      const res = await apiFetch("/api/keys", { cache: "no-store" });
      if (!res.ok) throw new Error("load failed");
      const data = (await res.json()) as StoredKey[];
      if (id !== requestId.current) return;
      setKeys(Array.isArray(data) ? data : []);
      setError(null);
    } catch {
      if (id !== requestId.current) return;
      setError("Could not load your keys.");
    }
  }, []);

  useEffect(() => {
    // Fetch on mount and when refreshToken changes. State is set after the await.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    return () => {
      requestId.current += 1;
    };
  }, [load, refreshToken]);

  const retry = async () => {
    setRetrying(true);
    await load();
    setRetrying(false);
  };

  const closeDialog = () => {
    if (deleting) return;
    setDialogOpen(false);
    setDeleteError(null);
  };

  const remove = async (id: string) => {
    setDeleting(true);
    setDeleteError(null);
    try {
      const res = await apiFetch(`/api/keys/${id}`, { method: "DELETE" });
      if (res.ok || res.status === 404) {
        setKeys((prev) => (prev ?? []).filter((k) => k.id !== id));
        setDialogOpen(false);
        // The deleted row held focus. Move it to the section heading so it does not drop to <body>.
        requestAnimationFrame(() => document.getElementById("keys-heading")?.focus());
      } else {
        setDeleteError("Could not delete the key. Try again.");
      }
    } catch {
      setDeleteError("Could not delete the key. Try again.");
    } finally {
      setDeleting(false);
    }
  };

  if (keys === null) {
    if (error) {
      return (
        <div className="flex flex-col items-start gap-3 p-6">
          <p role="alert" className="flex items-center gap-2 text-sm text-danger">
            <AlertCircle size={16} aria-hidden="true" />
            {error}
          </p>
          <Button size="sm" loading={retrying} onClick={() => void retry()}>
            Try again
          </Button>
        </div>
      );
    }
    return (
      <div role="status" aria-busy="true" className="divide-y divide-line">
        <span className="sr-only">Loading keys...</span>
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

  const errorBanner = error ? (
    <div role="alert" className="flex flex-wrap items-center gap-3 border-b border-line p-4 text-sm text-danger">
      <span className="flex items-center gap-2">
        <AlertCircle size={16} aria-hidden="true" />
        {error} The list below may be out of date.
      </span>
      <Button size="sm" variant="secondary" loading={retrying} onClick={() => void retry()}>
        Try again
      </Button>
    </div>
  ) : null;

  if (keys.length === 0) {
    return (
      <>
        {errorBanner}
        <div className="flex flex-col items-center px-6 py-12 text-center">
          <span className="flex size-12 items-center justify-center rounded-full bg-accent-subtle text-accent-text">
            <KeyRound size={24} aria-hidden="true" />
          </span>
          <p className="mt-4 text-sm font-medium text-fg">No keys saved.</p>
          <p className="mt-1 max-w-xs text-sm text-fg-2">
            Add your first API key to start coding with AI.
          </p>
        </div>
      </>
    );
  }

  return (
    <>
      {errorBanner}
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
                {wasReplaced(k) ? "Updated" : "Added"}{" "}
                <time dateTime={wasReplaced(k) && k.updated_at ? k.updated_at : k.created_at}>
                  {formatDate(wasReplaced(k) && k.updated_at ? k.updated_at : k.created_at)}
                </time>
              </p>
            </div>
            <Button
              variant="danger"
              size="md"
              className="min-h-11 sm:min-h-0"
              aria-label={`Delete ${providerName(k.provider)} key`}
              onClick={() => {
                setTarget(k);
                setDeleteError(null);
                setDialogOpen(true);
              }}
            >
              Delete
            </Button>
          </li>
        ))}
      </ul>

      <Dialog
        open={dialogOpen}
        onClose={closeDialog}
        dismissible={!deleting}
        title="Delete this key?"
        description={
          target
            ? `The ${providerName(target.provider)} key is removed from Veda. AI requests with it stop working.`
            : undefined
        }
        className="max-w-md"
      >
        <div aria-live="polite">
          {deleteError ? (
            <p className="mb-4 flex items-center gap-2 text-sm text-danger">
              <AlertCircle size={16} aria-hidden="true" />
              {deleteError}
            </p>
          ) : null}
        </div>
        <div className="flex justify-end gap-2">
          <Button
            variant="secondary"
            size="lg"
            className="sm:h-9 sm:text-sm"
            disabled={deleting}
            onClick={closeDialog}
          >
            Cancel
          </Button>
          <Button
            variant="danger"
            size="lg"
            className="sm:h-9 sm:text-sm"
            loading={deleting}
            onClick={() => target && void remove(target.id)}
          >
            {deleting ? "Deleting..." : "Delete key"}
          </Button>
        </div>
      </Dialog>
    </>
  );
}
