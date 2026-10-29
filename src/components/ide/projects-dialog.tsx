"use client";

import { Dialog } from "@/components/ui/dialog";
import { ProjectList } from "@/components/projects/project-list";
import { useFileSystem } from "@/hooks/use-file-system";
import { projectHref } from "@/lib/projects/projects";

/** Switch to another project, make a new one, or delete one. Opening a project is a full page load. */
export function ProjectsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { userId, projectName, flushNow } = useFileSystem();

  async function openProject(name: string) {
    // Save the open project first. The next page loads the other project from a clean runtime.
    await flushNow().catch(() => undefined);
    // A full page load is required (COOP/COEP).
    window.location.assign(projectHref(name));
  }

  return (
    <Dialog open={open} onClose={onClose} title="Projects" description="Each project has its own files. Switching saves this project first.">
      {open ? <ProjectList userId={userId} current={projectName} onOpen={openProject} /> : null}
    </Dialog>
  );
}
