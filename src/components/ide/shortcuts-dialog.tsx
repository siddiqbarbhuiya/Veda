"use client";

import { Dialog } from "@/components/ui/dialog";
import { Kbd } from "@/components/ui/kbd";
import { SHORTCUTS, displayKeys } from "./use-ide-shortcuts";

export { SHORTCUTS };

export function ShortcutsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onClose={onClose} title="Keyboard shortcuts">
      <ul className="divide-y divide-line">
        {SHORTCUTS.map((s) => (
          <li key={s.id} className="flex items-center justify-between gap-4 py-2 text-ui">
            <span>{s.label}</span>
            <span className="flex items-center gap-1">
              {displayKeys(s.keys).map((k) => (
                <Kbd key={k}>{k}</Kbd>
              ))}
            </span>
          </li>
        ))}
      </ul>
    </Dialog>
  );
}
