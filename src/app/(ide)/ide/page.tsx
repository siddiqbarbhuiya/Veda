"use client";

import dynamic from "next/dynamic";
import { IdeSkeleton } from "@/components/ide/ide-skeleton";

const IdeLayout = dynamic(() => import("@/components/ide/ide-layout"), {
  ssr: false,
  loading: () => <IdeSkeleton />,
});

export default function IdePage() {
  return <IdeLayout />;
}
