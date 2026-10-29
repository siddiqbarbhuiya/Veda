"use client";

import { useState } from "react";
import { CloudOff, FolderOpen, Loader2, Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/field";
import { useProjects } from "@/hooks/use-projects";
import { DEFAULT_PROJECT, MAX_PROJECTS, formatUpdated, validateProjectName } from "@/lib/projects/projects";

/**
 * The user's projects: create, open and delete. Used on the dashboard and in the IDE.
 * `current` is the project that is open now (the IDE). It cannot be deleted.
 * `onOpen` opens a project. It must do a full page load, because the IDE needs cross-origin isolation.
 */
export function ProjectList({
  userId,
  current,
  onOpen,
}: {
  userId: string | null;
  current?: string;
  onOpen: (name: string) => void | Promise<void>;
}) {
  const { projects, loading, cloudNote, create, remove } = useProjects(userId);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const saved = projects.filter((p) => p.updatedAt > 0 || p.name !== DEFAULT_PROJECT).length;
  const check = validateProjectName(name, projects.map((p) => p.name));
  const fieldError = name.trim() && !check.ok ? check.reason : null;
  const full = saved >= MAX_PROJECTS;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!check.ok || busy) return;
    setBusy(true);
    const result = await create(name);
    setBusy(false);
    if (!result.ok) {
      setError(result.reason);
      return;
    }
    setName("");
    await onOpen(result.name);
  }

  async function confirmDelete() {
    if (!toDelete) return;
    setDeleting(true);
    const result = await remove(toDelete);
    setDeleting(false);
    if (!result.ok) {
      setError(result.reason);
    }
    setToDelete(null);
  }

  return (
    <div className="space-y-4">
      <form onSubmit={submit} className="space-y-2" noValidate>
        <Field label="New project" error={fieldError ?? error} hint={full ? `You have ${MAX_PROJECTS} projects. Delete one to make a new one.` : undefined}>
          {(props) => (
            <div className="flex gap-2">
              <Input
                {...props}
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setError(null);
                }}
                placeholder="My project"
                autoComplete="off"
                spellCheck={false}
                disabled={full || busy}
                maxLength={80}
              />
              <Button type="submit" variant="primary" leadingIcon={busy ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <Plus size={16} aria-hidden="true" />} disabled={full || busy || !name.trim()}>
                Create
              </Button>
            </div>
          )}
        </Field>
      </form>

      <div className="flex items-center justify-between text-caption text-fg-3">
        <span>
          {saved} of {MAX_PROJECTS} projects
        </span>
        {loading ? (
          <span role="status" className="flex items-center gap-1">
            <Loader2 size={12} className="animate-spin" aria-hidden="true" /> Loading...
          </span>
        ) : null}
      </div>

      {cloudNote ? (
        <p role="status" className="flex items-start gap-2 text-caption text-warning">
          <CloudOff size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
          {cloudNote}
        </p>
      ) : null}

      <ul aria-label="Your projects" className="divide-y divide-line rounded-lg border border-line-strong">
        {projects.map((p) => {
          const isCurrent = p.name === current;
          return (
            <li key={p.name} className="flex items-center gap-3 px-3 py-2">
              <FolderOpen size={16} className="shrink-0 text-fg-3" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="truncate text-ui font-medium text-fg">{p.name}</span>
                  {isCurrent ? <Badge tone="accent">Open now</Badge> : null}
                  {p.source === "local" && p.updatedAt > 0 ? <Badge tone="warning">Not in the cloud yet</Badge> : null}
                </div>
                <div className="text-caption text-fg-3">{formatUpdated(p.updatedAt)}</div>
              </div>
              <Button variant="secondary" size="sm" disabled={isCurrent} onClick={() => void onOpen(p.name)} aria-label={`Open ${p.name}`}>
                Open
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                disabled={isCurrent || (p.name === DEFAULT_PROJECT && p.updatedAt === 0)}
                onClick={() => setToDelete(p.name)}
                aria-label={`Delete ${p.name}`}
                title={isCurrent ? "Open another project to delete this one" : `Delete ${p.name}`}
              >
                <Trash2 size={16} aria-hidden="true" />
              </Button>
            </li>
          );
        })}
      </ul>

      <Dialog
        open={toDelete !== null}
        onClose={() => (deleting ? undefined : setToDelete(null))}
        title={toDelete ? `Delete ${toDelete}?` : "Delete project"}
        description="This deletes the files of this project from the cloud and from this browser. You cannot undo this."
        className="w-[min(26rem,calc(100vw-2rem))]"
        dismissible={!deleting}
      >
        <div className="flex justify-end gap-2">
          <Button variant="secondary" size="sm" autoFocus disabled={deleting} onClick={() => setToDelete(null)}>
            Cancel
          </Button>
          <Button variant="danger" size="sm" loading={deleting} onClick={() => void confirmDelete()}>
            Delete
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
