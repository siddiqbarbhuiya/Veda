"use client";

import { useEffect, useState } from "react";
import { createBrowserClient } from "@/lib/supabase/client";
import { FileSystemContext, useFileSystemState } from "@/hooks/use-file-system";

export default function IdeRouteLayout({ children }: { children: React.ReactNode }) {
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    createBrowserClient()
      .auth.getUser()
      .then(({ data }) => setUserId(data.user?.id ?? null));
  }, []);

  const fs = useFileSystemState(userId);

  return (
    <FileSystemContext.Provider value={fs}>
      <div className="h-screen w-screen overflow-hidden bg-neutral-950 text-neutral-200">{children}</div>
    </FileSystemContext.Provider>
  );
}
