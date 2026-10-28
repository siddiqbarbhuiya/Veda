"use client";

import dynamic from "next/dynamic";

const IdeLayout = dynamic(() => import("@/components/ide/ide-layout"), {
  ssr: false,
  loading: () => <div className="p-4 text-sm text-neutral-400">Loading IDE...</div>,
});

export default function IdePage() {
  return <IdeLayout />;
}
