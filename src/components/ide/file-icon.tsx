import {
  File,
  FileCode,
  FileCog,
  FileJson,
  FileText,
  FileTerminal,
  Folder,
  FolderOpen,
  Globe,
  Hash,
  Image as ImageIcon,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/cn";

type Kind = { icon: LucideIcon; tint: string };

const BY_EXT: Record<string, Kind> = {
  js: { icon: FileCode, tint: "text-warning" },
  jsx: { icon: FileCode, tint: "text-warning" },
  mjs: { icon: FileCode, tint: "text-warning" },
  cjs: { icon: FileCode, tint: "text-warning" },
  ts: { icon: FileCode, tint: "text-info" },
  tsx: { icon: FileCode, tint: "text-info" },
  py: { icon: FileCode, tint: "text-success" },
  json: { icon: FileJson, tint: "text-warning" },
  md: { icon: FileText, tint: "text-fg-2" },
  txt: { icon: FileText, tint: "text-fg-2" },
  html: { icon: Globe, tint: "text-danger" },
  css: { icon: Hash, tint: "text-info" },
  sh: { icon: FileTerminal, tint: "text-success" },
  yml: { icon: FileCog, tint: "text-accent-text" },
  yaml: { icon: FileCog, tint: "text-accent-text" },
  png: { icon: ImageIcon, tint: "text-accent-text" },
  jpg: { icon: ImageIcon, tint: "text-accent-text" },
  jpeg: { icon: ImageIcon, tint: "text-accent-text" },
  svg: { icon: ImageIcon, tint: "text-accent-text" },
  gif: { icon: ImageIcon, tint: "text-accent-text" },
};

export function FileIcon({
  name,
  type = "file",
  open = false,
  size = 16,
  className,
}: {
  name: string;
  type?: "file" | "directory";
  open?: boolean;
  size?: number;
  className?: string;
}) {
  if (type === "directory") {
    const Icon = open ? FolderOpen : Folder;
    return <Icon size={size} strokeWidth={1.75} aria-hidden="true" className={cn("shrink-0 text-accent-text", className)} />;
  }
  const ext = name.includes(".") ? (name.split(".").pop()?.toLowerCase() ?? "") : "";
  const kind = BY_EXT[ext] ?? { icon: File, tint: "text-fg-3" };
  const Icon = kind.icon;
  return <Icon size={size} strokeWidth={1.75} aria-hidden="true" className={cn("shrink-0", kind.tint, className)} />;
}
