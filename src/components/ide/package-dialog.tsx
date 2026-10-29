"use client";

import { useState } from "react";
import { Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/field";
import { useFileSystem } from "@/hooks/use-file-system";
import { installCommands, packageFolders, validatePackageSpec } from "@/lib/templates/packages";
import { emit } from "./ide-events";

export function PackageDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { files } = useFileSystem();
  const [spec, setSpec] = useState("");
  const [dev, setDev] = useState(false);
  const [folderPick, setFolderPick] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);

  const folders = packageFolders(files);
  // With no package.json anywhere the project root gets a new one.
  const options = folders.length > 0 ? folders : [""];
  const folder = folderPick !== null && options.includes(folderPick) ? folderPick : options[0];
  const check = validatePackageSpec(spec);
  const error = touched && !check.ok ? check.reason : null;

  function close() {
    setSpec("");
    setDev(false);
    setFolderPick(null);
    setTouched(false);
    onClose();
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (!check.ok) return;
    emit("veda:run-commands", {
      cwd: folder,
      commands: installCommands(check.value, { dev, hasPackageJson: folders.includes(folder) }),
    });
    close();
  }

  return (
    <Dialog open={open} onClose={close} title="Add an npm package" description="The package is installed in the Node.js runtime. You see the output in the terminal.">
      <form onSubmit={submit} className="space-y-4">
        <Field label="Package name" hint="Examples: lodash, axios, react-dom@18" error={error}>
          {(props) => (
            <Input
              {...props}
              value={spec}
              onChange={(e) => setSpec(e.target.value)}
              onBlur={() => setTouched(true)}
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              placeholder="lodash"
              autoFocus
            />
          )}
        </Field>

        {options.length > 1 ? (
          <Field label="Install in">
            {(props) => (
              <Select {...props} value={folder} onChange={(e) => setFolderPick(e.target.value)}>
                {options.map((f) => (
                  <option key={f || "root"} value={f}>
                    {f ? `${f}/` : "Project root"}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        ) : null}

        <label className="flex items-center gap-2 text-sm text-fg-2">
          <input type="checkbox" className="size-4 accent-[var(--accent)]" checked={dev} onChange={(e) => setDev(e.target.checked)} />
          Dev dependency (<code>--save-dev</code>)
        </label>

        {!folders.includes(folder) ? <p className="text-caption text-fg-3">There is no package.json here. Veda runs <code>npm init -y</code> first.</p> : null}

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" leadingIcon={<Package size={16} aria-hidden="true" />}>
            Install
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
