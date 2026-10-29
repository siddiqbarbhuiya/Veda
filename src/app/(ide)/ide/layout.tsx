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
      <div className="h-dvh w-screen overflow-hidden bg-app text-fg">{children}</div>
    </FileSystemContext.Provider>
  );
}
