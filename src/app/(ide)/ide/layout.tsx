"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { createBrowserClient } from "@/lib/supabase/client";
import { FileSystemContext, useFileSystemState } from "@/hooks/use-file-system";
import { Button } from "@/components/ui/button";
import { IdeSkeleton } from "@/components/ide/ide-skeleton";

export default function IdeRouteLayout({ children }: { children: React.ReactNode }) {
  const [userId, setUserId] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    createBrowserClient()
      .auth.getUser()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error && !data.user) {
          // A missing session is "not signed in". Anything else is a network or server error.
          if (error.name === "AuthSessionMissingError") window.location.assign("/login"); // eslint-disable-line @next/next/no-location-assign-relative-destination
          else setAuthError(error.message || "Could not check your session.");
          return;
        }
        if (!data.user) {
          window.location.assign("/login"); // eslint-disable-line @next/next/no-location-assign-relative-destination
          return;
        }
        setAuthError(null);
        setUserId(data.user.id);
      })
      .catch((err: unknown) => {
        if (!cancelled) setAuthError(err instanceof Error && err.message ? err.message : "Could not check your session.");
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const retry = useCallback(() => {
    setAuthError(null);
    setAttempt((n) => n + 1);
  }, []);

  const fs = useFileSystemState(userId);

  return (
    <FileSystemContext.Provider value={fs}>
      <div className="h-dvh w-screen overflow-hidden bg-app text-fg">
        {authError ? (
          <div className="flex h-full flex-col items-center justify-center gap-4 px-6 text-center">
            <span className="flex size-12 items-center justify-center rounded-xl bg-warning-subtle text-warning">
              <AlertTriangle size={24} aria-hidden="true" />
            </span>
            <h1 className="font-display text-xl font-semibold">Could not open the IDE</h1>
            <p role="alert" className="max-w-sm text-ui text-fg-2">
              {authError} Check your connection and try again. Your files are not lost.
            </p>
            <Button variant="primary" leadingIcon={<RefreshCw size={16} aria-hidden="true" />} onClick={retry}>
              Retry
            </Button>
          </div>
        ) : fs.loaded ? (
          children
        ) : (
          <IdeSkeleton />
        )}
      </div>
    </FileSystemContext.Provider>
  );
}
