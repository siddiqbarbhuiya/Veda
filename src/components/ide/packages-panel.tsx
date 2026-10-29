"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, Loader2, Package, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/field";
import { cn } from "@/lib/cn";
import { findNode, useFileSystem } from "@/hooks/use-file-system";
import { usePackageSearch } from "@/hooks/use-package-search";
import { formatDownloads, searchNpm } from "@/lib/packages/npm-search";
import { loadBuiltInNames, lookupPypi, matchBuiltIn } from "@/lib/packages/pip-search";
import { isNpmInstalled, listNpmDeps } from "@/lib/packages/installed";
import { installCommands, packageFolders, validatePackageSpec } from "@/lib/templates/packages";
import { parseRequirements, removeRequirement, requirementName, validatePipSpec } from "@/lib/templates/pip";
import { useRuntime } from "./runtime-context";
import { emit, useRuntimeState } from "./ide-events";
import { PackageCombobox, type ComboOption } from "./package-combobox";

type Kind = "npm" | "pip";
type PipHit = { name: string; source: "built-in" | "pypi"; version?: string; summary?: string };

function abortError() {
  return new DOMException("Aborted", "AbortError");
}

/**
 * Search, install and remove packages. It lives in the PACKAGES section at the bottom of the Explorer.
 * `focusToken` changes when something asks to focus the search box (the menu, the palette, the terminal button).
 */
export function PackagesPanel({ focusToken }: { focusToken: number }) {
  const { files, applyRuntimeChanges } = useFileSystem();
  const { runtime } = useRuntime();
  const { status } = useRuntimeState();
  const [kindPick, setKindPick] = useState<Kind | null>(null);
  const [query, setQuery] = useState("");
  const [dev, setDev] = useState(false);
  const [save, setSave] = useState(true);
  const [folderPick, setFolderPick] = useState<string | null>(null);
  const [typedError, setTypedError] = useState<string | null>(null);
  const [pending, setPending] = useState<{ text: string; done: boolean; failed: boolean } | null>(null);
  const sawBusy = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Something asked for the search box: focus it.
  useEffect(() => {
    if (focusToken > 0) inputRef.current?.focus();
  }, [focusToken]);

  // Until the user chooses, the kind follows the runtime: Python gets pip, Node.js gets npm.
  const kind: Kind = kindPick ?? (runtime === "python" ? "pip" : "npm");
  const folders = packageFolders(files);
  // With no package.json anywhere the project root gets a new one.
  const options = folders.length > 0 ? folders : [""];
  const folder = folderPick !== null && options.includes(folderPick) ? folderPick : options[0];

  const packageJsonText = findNode(files, folder ? `${folder}/package.json` : "package.json")?.content;
  const installedNpm = useMemo(() => listNpmDeps(packageJsonText), [packageJsonText]);
  const requirementsText = findNode(files, "requirements.txt")?.content;
  const installedPip = useMemo(() => parseRequirements(requirementsText), [requirementsText]);
  const pipNames = useMemo(() => new Set(installedPip.map(requirementName)), [installedPip]);

  // ---- search ----
  const npm = usePackageSearch(kind === "npm" ? query : "", (q, signal) => searchNpm(q, { signal }));
  const pip = usePackageSearch<PipHit>(
    kind === "pip" ? query : "",
    async (q, signal) => {
      const names = await loadBuiltInNames().catch(() => [] as string[]);
      const builtIn: PipHit[] = matchBuiltIn(names, q).map((name) => ({ name, source: "built-in" }));
      const typed = q.replace(/[<>=!~[].*$/, "").trim();
      let found: PipHit | null = null;
      if (validatePipSpec(typed).ok && !builtIn.some((b) => b.name.toLowerCase() === typed.toLowerCase())) {
        try {
          found = await lookupPypi(typed, { signal });
        } catch {
          // The built-in suggestions are still useful when PyPI cannot be reached.
          found = null;
        }
      }
      if (signal.aborted) throw abortError();
      return found ? [...builtIn, found] : builtIn;
    },
    { minLength: 1 }
  );

  const comboOptions: ComboOption[] =
    kind === "npm"
      ? npm.results.map((r) => ({
          id: r.name,
          title: r.name,
          meta: `v${r.version}`,
          subtitle: r.description,
          badge: isNpmInstalled(installedNpm, r.name)
            ? { label: "Installed", tone: "success" }
            : r.weekly
              ? { label: formatDownloads(r.weekly), tone: "neutral" }
              : undefined,
        }))
      : pip.results.map((r) => ({
          id: `${r.source}:${r.name}`,
          title: r.name,
          meta: r.version ? `v${r.version}` : undefined,
          subtitle: r.source === "built-in" ? "Ships with Python in the browser. Installs fast." : r.summary,
          badge: pipNames.has(requirementName(r.name))
            ? { label: "Installed", tone: "success" }
            : r.source === "built-in"
              ? { label: "Built in", tone: "accent" }
              : { label: "PyPI", tone: "neutral" },
        }));
  const search = kind === "npm" ? npm : pip;

  // ---- install and remove ----
  function start(text: string) {
    sawBusy.current = false;
    setPending({ text, done: false, failed: false });
    setQuery("");
    setTypedError(null);
  }

  function install(spec: string) {
    if (kind === "pip") {
      emit("veda:install-python", { specs: [spec], save });
    } else {
      emit("veda:run-commands", {
        cwd: folder,
        commands: installCommands(spec, { dev, hasPackageJson: folders.includes(folder) }),
      });
    }
    start(`Installing ${spec}`);
  }

  function submitTyped() {
    const check = kind === "pip" ? validatePipSpec(query) : validatePackageSpec(query);
    if (!check.ok) {
      setTypedError(check.reason);
      return;
    }
    install(check.value);
  }

  function removeNpm(name: string) {
    if (!validatePackageSpec(name).ok) return;
    emit("veda:run-commands", { cwd: folder, commands: [{ cmd: "npm", args: ["uninstall", name] }] });
    start(`Removing ${name}`);
  }

  function removePip(spec: string) {
    const text = removeRequirement(requirementsText, spec);
    applyRuntimeChanges(text ? { upsert: [["requirements.txt", text]], remove: [] } : { upsert: [], remove: ["requirements.txt"] });
    setPending({ text: `Removed ${requirementName(spec)} from requirements.txt. It stays loaded until you reload the page.`, done: true, failed: false });
  }

  // Follow the runtime: the install is running, then done or failed.
  useEffect(() => {
    if (!pending || pending.done) return;
    if (status === "booting" || status === "running") {
      sawBusy.current = true;
    } else if (sawBusy.current && (status === "idle" || status === "error")) {
      sawBusy.current = false;
      setPending((p) => (p ? { ...p, done: true, failed: status === "error" } : p));
    }
  }, [status, pending]);

  const typedSpec = query.trim();
  const typedOk = typedSpec.length > 0 && (kind === "pip" ? validatePipSpec(typedSpec).ok : validatePackageSpec(typedSpec).ok);

  const tab = (value: Kind, label: string) => (
    <button
      type="button"
      role="radio"
      aria-checked={kind === value}
      onClick={() => {
        setKindPick(value);
        setQuery("");
        setTypedError(null);
      }}
      className={cn(
        "h-7 flex-1 rounded px-2 text-caption font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        kind === value ? "bg-accent-subtle text-fg" : "text-fg-3 hover:text-fg"
      )}
    >
      {label}
    </button>
  );

  const installedRows =
    kind === "npm"
      ? installedNpm.map((p) => ({ key: p.name, name: p.name, version: p.version, dev: p.dev, remove: () => removeNpm(p.name) }))
      : installedPip.map((spec) => ({ key: spec, name: spec, version: "", dev: false, remove: () => removePip(spec) }));

  return (
    <div className="space-y-3 px-3 pb-3 pt-1">
      <div role="radiogroup" aria-label="Package manager" className="flex gap-1 rounded-md border border-line-strong bg-sunken p-0.5">
        {tab("npm", "npm (Node.js)")}
        {tab("pip", "pip (Python)")}
      </div>

      {kind === "npm" && options.length > 1 ? (
        <div className="space-y-1">
          <label htmlFor="pkg-folder" className="text-caption font-medium text-fg-2">
            Install in
          </label>
          <Select id="pkg-folder" value={folder} onChange={(e) => setFolderPick(e.target.value)}>
            {options.map((f) => (
              <option key={f || "root"} value={f}>
                {f ? `${f}/` : "Project root"}
              </option>
            ))}
          </Select>
        </div>
      ) : null}

      <PackageCombobox
        label={kind === "pip" ? "Search Python packages" : "Search npm packages"}
        value={query}
        onChange={(v) => {
          setQuery(v);
          setTypedError(null);
        }}
        options={comboOptions}
        loading={search.loading}
        error={typedError ?? search.error}
        placeholder={kind === "pip" ? "requests, numpy..." : "react, lodash..."}
        emptyText={
          kind === "pip" ? "No match. Press Enter to try the exact name on PyPI." : "No package found. Press Enter to install the exact name."
        }
        onPick={(o) => install(kind === "pip" ? o.title : o.id)}
        onSubmit={submitTyped}
        inputRef={inputRef}
      />

      {kind === "npm" ? (
        <label className="flex items-center gap-2 text-caption text-fg-2">
          <input type="checkbox" className="size-3.5 accent-[var(--accent)]" checked={dev} onChange={(e) => setDev(e.target.checked)} />
          Dev dependency (<code>--save-dev</code>)
        </label>
      ) : (
        <>
          <label className="flex items-start gap-2 text-caption text-fg-2">
            <input type="checkbox" className="mt-0.5 size-3.5 accent-[var(--accent)]" checked={save} onChange={(e) => setSave(e.target.checked)} />
            <span>
              Add to <code>requirements.txt</code> (installed again after a reload)
            </span>
          </label>
          <p className="text-caption text-fg-3">
            Pure Python packages and the packages that Pyodide ships (numpy, pandas, and more) work. Packages that need native code do not.
          </p>
        </>
      )}

      {kind === "npm" && !folders.includes(folder) ? (
        <p className="text-caption text-fg-3">
          There is no package.json here. Veda runs <code>npm init -y</code> first.
        </p>
      ) : null}

      {typedOk ? (
        <Button type="button" variant="primary" size="sm" className="w-full" leadingIcon={<Package size={14} aria-hidden="true" />} onClick={submitTyped}>
          <span className="truncate">Install {typedSpec}</span>
        </Button>
      ) : null}

      {pending ? (
        <p
          role="status"
          className={cn("flex items-start gap-2 rounded-md px-2.5 py-2 text-caption", pending.failed ? "bg-danger-subtle text-danger" : "bg-sunken text-fg-2")}
        >
          {pending.done ? (
            <CheckCircle2 size={14} className={cn("mt-0.5 shrink-0", pending.failed ? "text-danger" : "text-success")} aria-hidden="true" />
          ) : (
            <Loader2 size={14} className="mt-0.5 shrink-0 animate-spin" aria-hidden="true" />
          )}
          <span className="wrap-anywhere">
            {pending.done && !pending.text.startsWith("Removed")
              ? pending.failed
                ? `${pending.text} did not finish. See the terminal.`
                : `${pending.text.replace(/^Installing/, "Installed").replace(/^Removing/, "Removed")}.`
              : pending.text.startsWith("Removed")
                ? pending.text
                : `${pending.text}... The output is in the terminal.`}
          </span>
        </p>
      ) : null}

      <section aria-label="Installed packages">
        <h3 className="mb-1 flex items-center gap-2 text-caption font-medium text-fg-2">
          Installed
          <span className="truncate font-normal text-fg-3">
            {kind === "npm" ? (folders.includes(folder) ? `in ${folder ? `${folder}/` : ""}package.json` : "no package.json yet") : "in requirements.txt"}
          </span>
        </h3>
        {installedRows.length === 0 ? (
          <p className="rounded-md border border-dashed border-line-strong px-2.5 py-2 text-caption text-fg-3">No packages listed yet.</p>
        ) : (
          <ul className="max-h-48 divide-y divide-line overflow-y-auto rounded-md border border-line-strong">
            {installedRows.map((row) => (
              <li key={row.key} className="flex items-center gap-1.5 py-0.5 pl-2.5 pr-1">
                <span className="min-w-0 truncate text-ui text-fg">{row.name}</span>
                {row.version ? <span className="shrink-0 text-caption text-fg-3">{row.version}</span> : null}
                {row.dev ? <Badge tone="neutral">dev</Badge> : null}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="ml-auto shrink-0"
                  aria-label={`Remove ${row.name}`}
                  title={`Remove ${row.name}`}
                  onClick={row.remove}
                >
                  <Trash2 size={14} aria-hidden="true" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
