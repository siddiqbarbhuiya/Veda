"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { IndexedDBStore } from "@/lib/persistence/indexeddb";
import { CloudStore } from "@/lib/persistence/cloud-store";
import { clearBackup } from "@/lib/persistence/backup";
import { createBrowserClient } from "@/lib/supabase/client";
import { defaultFiles } from "@/hooks/use-file-system";
import {
  DEFAULT_PROJECT,
  MAX_PROJECTS,
  mergeProjects,
  validateProjectName,
  type ProjectInfo,
} from "@/lib/projects/projects";

export type ProjectResult = { ok: true; name: string } | { ok: false; reason: string };

/** The user's projects: list, create and delete. Browser copies and cloud copies are joined by name. */
export function useProjects(userId: string | null) {
  const [projects, setProjects] = useState<ProjectInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [cloudNote, setCloudNote] = useState<string | null>(null);
  const store = useMemo(() => new IndexedDBStore(), []);
  const cloud = useMemo(() => new CloudStore(createBrowserClient() as unknown as ConstructorParameters<typeof CloudStore>[0]), []);

  const refresh = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    const local = await store.list(userId);
    let remote: Array<{ name: string; updatedAt: number }> = [];
    let note: string | null = null;
    try {
      remote = await cloud.list(userId);
    } catch {
      note = "The cloud list is not available now. These are the projects in this browser.";
    }
    const merged = mergeProjects(remote, local);
    // The default project exists from the first visit, even before its first save.
    if (!merged.some((p) => p.name === DEFAULT_PROJECT)) {
      merged.push({ name: DEFAULT_PROJECT, updatedAt: 0, source: "local" });
    }
    setProjects(merged);
    setCloudNote(note);
    setLoading(false);
  }, [userId, store, cloud]);

  useEffect(() => {
    // Load once the user is known. State is set after the awaits.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
  }, [refresh]);

  const create = useCallback(
    async (raw: string): Promise<ProjectResult> => {
      if (!userId) return { ok: false, reason: "You are not signed in." };
      const saved = projects.filter((p) => p.updatedAt > 0 || p.name !== DEFAULT_PROJECT);
      if (saved.length >= MAX_PROJECTS) return { ok: false, reason: `You can keep ${MAX_PROJECTS} projects. Delete one first.` };
      const check = validateProjectName(raw, projects.map((p) => p.name));
      if (!check.ok) return { ok: false, reason: check.reason };
      const now = Date.now();
      const files = defaultFiles();
      // The cloud decides first, so two devices cannot make the same name. A network error is not a refusal:
      // the project is made in this browser and goes to the cloud when the editor opens it.
      const result = await cloud.create(userId, check.value, files, now);
      if (!result.ok && result.kind !== "other") return { ok: false, reason: result.error };
      await store.save(userId, check.value, files, now);
      await refresh();
      return { ok: true, name: check.value };
    },
    [userId, projects, cloud, store, refresh]
  );

  const remove = useCallback(
    async (name: string): Promise<ProjectResult> => {
      if (!userId) return { ok: false, reason: "You are not signed in." };
      // Delete the cloud copy first. If it stays, the project would come back from the cloud.
      const result = await cloud.remove(userId, name);
      if (!result.ok) return { ok: false, reason: "Could not delete the project in the cloud. Check your connection and try again." };
      await store.clear(userId, name);
      clearBackup(userId, name);
      await refresh();
      return { ok: true, name };
    },
    [userId, cloud, store, refresh]
  );

  return { projects, loading, cloudNote, refresh, create, remove };
}
