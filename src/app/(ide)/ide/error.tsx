"use client";

import { useContext, useEffect, useState } from "react";
import { AlertTriangle, RefreshCw, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FileSystemContext } from "@/hooks/use-file-system";

export default function IdeError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  // The route layout provides the file system, and it sits outside this boundary.
  const fs = useContext(FileSystemContext);
  const [note, setNote] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    console.error("IDE error", error.digest ?? "(no digest)", error);
  }, [error]);

  async function saveAndReload() {
    if (!fs) {
      window.location.reload();
      return;
    }
    setSaving(true);
    try {
      const { cloudOk } = await fs.flushNow();
      setNote(cloudOk ? "Your files are saved." : "Your files are saved on this device. The cloud copy was not updated.");
    } catch {
      setNote("Could not save your files. Do not close this tab.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 px-6 text-center">
      <span className="flex size-12 items-center justify-center rounded-xl bg-danger-subtle text-danger">
        <AlertTriangle size={24} aria-hidden="true" />
      </span>
      <h1 className="font-display text-xl font-semibold">Something went wrong in the IDE</h1>
      <p className="max-w-md text-ui text-fg-2">
        Your files are saved on this device. Try again. If the problem stays, save your files and reload the page. You can
        also export a ZIP from the IDE when it opens.
      </p>
      {error.digest ? <p className="text-caption text-fg-3">Error code: {error.digest}</p> : null}
      {note ? (
        <p role="status" className="text-ui text-fg-2">
          {note}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button variant="primary" leadingIcon={<RefreshCw size={16} aria-hidden="true" />} onClick={reset}>
          Try again
        </Button>
        <Button variant="secondary" loading={saving} leadingIcon={<Save size={16} aria-hidden="true" />} onClick={saveAndReload}>
          {fs ? "Save my files" : "Reload page"}
        </Button>
        {fs && note ? (
          <Button variant="ghost" onClick={() => window.location.reload()}>
            Reload page
          </Button>
        ) : null}
      </div>
    </div>
  );
}
