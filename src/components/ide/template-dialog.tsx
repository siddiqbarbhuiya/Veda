"use client";

import { useMemo, useState } from "react";
import { FileCode2, Play, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/field";
import { cn } from "@/lib/cn";
import { useFileSystem } from "@/hooks/use-file-system";
import { validateName } from "@/lib/files/validate-name";
import { TEMPLATES, getTemplate, templateEntries, uniqueFolder } from "@/lib/templates/templates";
import { useRuntime } from "./runtime-context";
import { emit } from "./ide-events";

function afterPaint(fn: () => void) {
  requestAnimationFrame(() => requestAnimationFrame(fn));
}

export function TemplateDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { files, applyRuntimeChanges, openFile } = useFileSystem();
  const { setRuntime } = useRuntime();
  const [templateId, setTemplateId] = useState(TEMPLATES[0].id);
  const [typed, setTyped] = useState<string | null>(null);
  const template = getTemplate(templateId) ?? TEMPLATES[0];
  const siblings = useMemo(() => files.map((n) => n.name), [files]);
  // Until the user types a name, the folder is the template id (with a number when it is taken).
  const folder = typed ?? uniqueFolder(template.id, siblings);
  const check = validateName(folder, siblings);
  const error = check.ok ? null : check.reason;

  function close() {
    setTyped(null);
    onClose();
  }

  function create(andRun: boolean) {
    if (!check.ok) return;
    const name = check.value;
    applyRuntimeChanges({ upsert: templateEntries(template, name), remove: [] });
    openFile(`${name}/${template.entry}`);
    if (template.runtime === "python") setRuntime("python");
    if (andRun && template.run.length > 0) {
      // Wait for the editor to hold the new files before the runtime copies them.
      afterPaint(() => emit("veda:run-commands", { cwd: name, commands: template.run, serves: template.serves }));
    }
    close();
  }

  return (
    <Dialog
      open={open}
      onClose={close}
      title="New project from a template"
      description="The template goes into its own folder. Your other files do not change."
    >
      <div className="space-y-4">
        <div role="radiogroup" aria-label="Template" className="grid gap-2 sm:grid-cols-2">
          {TEMPLATES.map((t) => {
            const selected = t.id === template.id;
            return (
              <button
                key={t.id}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => {
                  setTemplateId(t.id);
                  setTyped(null);
                }}
                className={cn(
                  "rounded-lg border p-3 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                  selected ? "border-accent bg-accent-subtle" : "border-line-strong bg-sunken hover:border-accent-text/70"
                )}
              >
                <span className="flex items-center gap-2 text-sm font-medium text-fg">
                  <FileCode2 size={16} aria-hidden="true" className="shrink-0 text-accent-text" />
                  {t.name}
                </span>
                <span className="mt-1 block text-caption text-fg-3">{t.description}</span>
              </button>
            );
          })}
        </div>

        <Field label="Folder name" error={error}>
          {(props) => <Input {...props} value={folder} onChange={(e) => setTyped(e.target.value)} autoComplete="off" spellCheck={false} />}
        </Field>

        {template.run.length > 0 ? (
          <p className="text-caption text-fg-3">
            {'"Create and run" installs the packages and starts the app. The first install can take about 20 seconds.'}
          </p>
        ) : null}

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button variant={template.run.length > 0 ? "secondary" : "primary"} leadingIcon={<Plus size={16} aria-hidden="true" />} disabled={!check.ok} onClick={() => create(false)}>
            Create
          </Button>
          {template.run.length > 0 ? (
            <Button variant="primary" leadingIcon={<Play size={16} aria-hidden="true" />} disabled={!check.ok} onClick={() => create(true)}>
              Create and run
            </Button>
          ) : null}
        </div>
      </div>
    </Dialog>
  );
}
