"use client";

import { useEffect, useState } from "react";
import { ProjectList } from "@/components/projects/project-list";
import { Card } from "@/components/ui/card";
import { createBrowserClient } from "@/lib/supabase/client";
import { projectHref } from "@/lib/projects/projects";

export default function ProjectsSection() {
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    createBrowserClient()
      .auth.getUser()
      .then(({ data }) => {
        if (!cancelled) setUserId(data.user?.id ?? null);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section aria-labelledby="projects-heading" className="space-y-3">
      <h2
        id="projects-heading"
        tabIndex={-1}
        className="font-display text-xl font-semibold tracking-[-0.01em] focus:outline-none"
      >
        Your projects
      </h2>
      <Card className="p-6">
        <ProjectList
          userId={userId}
          // The IDE needs cross-origin isolation, so opening it is a full page load.
          onOpen={(name) => window.location.assign(projectHref(name))}
        />
      </Card>
    </section>
  );
}
