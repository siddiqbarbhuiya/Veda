"use client";

import { Dialog } from "@/components/ui/dialog";
import { Kbd } from "@/components/ui/kbd";

export const SHORTCUTS: { keys: string[]; label: string }[] = [
  { keys: ["Ctrl", "K"], label: "Command palette" },
  { keys: ["Ctrl", "Enter"], label: "Run code" },
  { keys: ["Ctrl", "B"], label: "Toggle sidebar" },
  { keys: ["Ctrl", "J"], label: "Toggle terminal" },
  { keys: ["Ctrl", "Shift", "L"], label: "Toggle and focus chat" },
  { keys: ["Alt", "N"], label: "New file" },
  { keys: ["?"], label: "Keyboard shortcuts" },
];

export function ShortcutsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Keyboard shortcuts"
      description="On macOS, use Cmd in place of Ctrl."
    >
      <ul className="divide-y divide-line">
        {SHORTCUTS.map((s) => (
          <li key={s.label} className="flex items-center justify-between gap-4 py-2 text-ui">
            <span>{s.label}</span>
            <span className="flex items-center gap-1">
              {s.keys.map((k) => (
                <Kbd key={k}>{k}</Kbd>
              ))}
            </span>
          </li>
        ))}
      </ul>
    </Dialog>
  );
}
