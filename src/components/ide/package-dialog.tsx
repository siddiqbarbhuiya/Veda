"use client";

import { useState } from "react";
import { Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/field";
import { cn } from "@/lib/cn";
import { useFileSystem } from "@/hooks/use-file-system";
import { installCommands, packageFolders, validatePackageSpec } from "@/lib/templates/packages";
import { validatePipSpec } from "@/lib/templates/pip";
import { useRuntime } from "./runtime-context";
import { emit } from "./ide-events";

type Kind = "npm" | "pip";

export function PackageDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { files } = useFileSystem();
  const { runtime } = useRuntime();
  const [kindPick, setKindPick] = useState<Kind | null>(null);
  const [spec, setSpec] = useState("");
  const [dev, setDev] = useState(false);
  const [save, setSave] = useState(true);
  const [folderPick, setFolderPick] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);

  // Until the user chooses, the kind follows the runtime: Python gets pip, Node.js gets npm.
  const kind: Kind = kindPick ?? (runtime === "python" ? "pip" : "npm");
  const folders = packageFolders(files);
  // With no package.json anywhere the project root gets a new one.
  const options = folders.length > 0 ? folders : [""];
  const folder = folderPick !== null && options.includes(folderPick) ? folderPick : options[0];
  const check = kind === "pip" ? validatePipSpec(spec) : validatePackageSpec(spec);
  const error = touched && !check.ok ? check.reason : null;

  function close() {
    setKindPick(null);
    setSpec("");
    setDev(false);
    setSave(true);
    setFolderPick(null);
    setTouched(false);
    onClose();
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (!check.ok) return;
    if (kind === "pip") {
      emit("veda:install-python", { specs: [check.value], save });
    } else {
      emit("veda:run-commands", {
        cwd: folder,
        commands: installCommands(check.value, { dev, hasPackageJson: folders.includes(folder) }),
      });
    }
    close();
  }

  const tab = (value: Kind, label: string) => (
    <button
      type="button"
      role="radio"
      aria-checked={kind === value}
      onClick={() => {
        setKindPick(value);
        setTouched(false);
      }}
      className={cn(
        "h-8 flex-1 rounded-md px-3 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        kind === value ? "bg-accent-subtle text-fg" : "text-fg-3 hover:text-fg"
      )}
    >
      {label}
    </button>
  );

  return (
    <Dialog
      open={open}
      onClose={close}
      title="Add a package"
      description={
        kind === "pip"
          ? "The package is installed in Python (in your browser). You see the output in the terminal."
          : "The package is installed in the Node.js runtime. You see the output in the terminal."
      }
    >
      <form onSubmit={submit} className="space-y-4">
        <div role="radiogroup" aria-label="Package manager" className="flex gap-1 rounded-lg border border-line-strong bg-sunken p-1">
          {tab("npm", "npm (Node.js)")}
          {tab("pip", "pip (Python)")}
        </div>

        <Field
          label="Package name"
          hint={kind === "pip" ? "Examples: requests, numpy, pandas, rich==13.7.1" : "Examples: lodash, axios, react-dom@18"}
          error={error}
        >
          {(props) => (
            <Input
              {...props}
              value={spec}
              onChange={(e) => setSpec(e.target.value)}
              onBlur={() => setTouched(true)}
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              placeholder={kind === "pip" ? "requests" : "lodash"}
              autoFocus
            />
          )}
        </Field>

        {kind === "npm" && options.length > 1 ? (
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

        {kind === "npm" ? (
          <label className="flex items-center gap-2 text-sm text-fg-2">
            <input type="checkbox" className="size-4 accent-[var(--accent)]" checked={dev} onChange={(e) => setDev(e.target.checked)} />
            Dev dependency (<code>--save-dev</code>)
          </label>
        ) : (
          <>
            <label className="flex items-center gap-2 text-sm text-fg-2">
              <input type="checkbox" className="size-4 accent-[var(--accent)]" checked={save} onChange={(e) => setSave(e.target.checked)} />
              Add to <code>requirements.txt</code> (installed again after a reload)
            </label>
            <p className="text-caption text-fg-3">
              Python runs in the browser. Packages with pure Python code, and the packages that Pyodide ships (such as numpy and pandas), work. Packages that need native code do not.
            </p>
          </>
        )}

        {kind === "npm" && !folders.includes(folder) ? (
          <p className="text-caption text-fg-3">There is no package.json here. Veda runs <code>npm init -y</code> first.</p>
        ) : null}

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
