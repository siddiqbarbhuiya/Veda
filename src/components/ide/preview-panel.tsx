"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import { ExternalLink, Globe, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useRunningServers } from "@/hooks/use-webcontainer";
import { preferredServer } from "@/lib/templates/preview";

/** The live preview of a web server that runs in the Node.js runtime (Vite, Express, and so on). */
export default function PreviewPanel({ tabs }: { tabs: ReactNode }) {
  const servers = useRunningServers();
  const [picked, setPicked] = useState<number | null>(null);
  const [nonce, setNonce] = useState(0);
  const server = servers.find((s) => s.port === picked) ?? preferredServer(servers);

  return (
    <div id="preview-panel" data-panel="preview" className="flex h-full min-h-0 w-full flex-col bg-panel">
      <div className="flex h-9 shrink-0 items-center gap-2 border-b border-line bg-elevated pl-3 pr-2">
        {tabs}
        {servers.length > 1 ? (
          <select
            aria-label="Server"
            value={server?.port ?? ""}
            onChange={(e) => setPicked(Number(e.target.value))}
            className="h-6 rounded-md border border-control bg-sunken px-1 text-caption text-fg"
          >
            {servers.map((s) => (
              <option key={s.port} value={s.port}>
                Port {s.port}
              </option>
            ))}
          </select>
        ) : null}
        {server ? <span className="min-w-0 truncate text-caption text-fg-3">{server.url}</span> : null}
        <div className="ml-auto flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Reload preview"
            title="Reload preview"
            disabled={!server}
            onClick={() => setNonce((n) => n + 1)}
          >
            <RotateCw size={16} aria-hidden="true" />
          </Button>
          {server ? (
            <a
              href={server.url}
              target="_blank"
              rel="noreferrer"
              aria-label="Open preview in a new tab"
              title="Open preview in a new tab"
              className="inline-flex size-8 items-center justify-center rounded-md text-fg-3 hover:bg-fg/[0.06] hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              <ExternalLink size={16} aria-hidden="true" />
            </a>
          ) : null}
        </div>
      </div>
      <div className="relative min-h-0 flex-1 bg-white">
        {server ? (
          <iframe
            key={`${server.url}-${nonce}`}
            src={server.url}
            title="Preview"
            className="absolute inset-0 h-full w-full border-0"
            allow="cross-origin-isolated"
          />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-panel px-6 text-center text-ui text-fg-3">
            <Globe size={24} aria-hidden="true" />
            <p>No web app is running.</p>
            <p className="text-caption">Create a Vite + React or Express project from a template, and the app shows here.</p>
          </div>
        )}
      </div>
    </div>
  );
}
