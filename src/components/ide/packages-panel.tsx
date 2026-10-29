"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Loader2, Trash2, X } from "lucide-react";
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
            ? { label: "added", tone: "success" }
            : r.weekly
              ? { label: formatDownloads(r.weekly).replace("/week", ""), tone: "neutral" }
              : undefined,
        }))
      : pip.results.map((r) => ({
          id: `${r.source}:${r.name}`,
          title: r.name,
          meta: r.version ? `v${r.version}` : undefined,
          subtitle: r.source === "built-in" ? "Built in. Installs fast." : r.summary,
          badge: pipNames.has(requirementName(r.name))
            ? { label: "added", tone: "success" }
            : r.source === "built-in"
              ? { label: "built-in", tone: "accent" }
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
        "h-4 flex-1 rounded-sm text-[10px] font-medium leading-none transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring",
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

  const check = "size-2.5 accent-[var(--accent)]";

  return (
    <div className="space-y-1.5 px-2 pb-1.5 pt-0.5 text-[10px] text-fg-2">
      <div role="radiogroup" aria-label="Package manager" className="flex gap-0.5 rounded border border-line-strong bg-sunken p-px">
        {tab("npm", "npm")}
        {tab("pip", "pip")}
      </div>

      {kind === "npm" && options.length > 1 ? (
        <select
          aria-label="Install in"
          title="Install in"
          value={folder}
          onChange={(e) => setFolderPick(e.target.value)}
          className="h-5 w-full rounded border border-control bg-sunken px-1 text-[10px] text-fg"
        >
          {options.map((f) => (
            <option key={f || "root"} value={f}>
              {f ? `${f}/` : "root"}
            </option>
          ))}
        </select>
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
        placeholder={kind === "pip" ? "Search pip" : "Search npm"}
        emptyText="No match. Enter = exact name."
        onPick={(o) => install(kind === "pip" ? o.title : o.id)}
        onSubmit={submitTyped}
        inputRef={inputRef}
      />

      <div className="flex items-center gap-2">
        {kind === "npm" ? (
          <label className="flex items-center gap-1" title="Install as a dev dependency (--save-dev)">
            <input type="checkbox" className={check} checked={dev} onChange={(e) => setDev(e.target.checked)} />
            dev
          </label>
        ) : (
          <label className="flex items-center gap-1" title="Add to requirements.txt, installed again after a reload">
            <input type="checkbox" className={check} checked={save} onChange={(e) => setSave(e.target.checked)} />
            save to requirements.txt
          </label>
        )}
        {typedOk ? (
          <button
            type="button"
            onClick={submitTyped}
            title={`Install ${typedSpec}`}
            className="ml-auto h-4 max-w-[60%] truncate rounded bg-accent px-1.5 text-[10px] font-medium leading-none text-white hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
          >
            Install {typedSpec}
          </button>
        ) : null}
      </div>

      {pending ? (
        <p
          role="status"
          className={cn("flex items-start gap-1 rounded px-1.5 py-1 leading-tight", pending.failed ? "bg-danger-subtle text-danger" : "bg-sunken text-fg-2")}
        >
          {pending.failed ? (
            <X size={10} className="mt-px shrink-0" aria-hidden="true" />
          ) : pending.done ? (
            <Check size={10} className="mt-px shrink-0 text-success" aria-hidden="true" />
          ) : (
            <Loader2 size={10} className="mt-px shrink-0 animate-spin" aria-hidden="true" />
          )}
          <span className="wrap-anywhere">
            {pending.failed
              ? `${pending.text.replace(/^Installing/, "Failed:").replace(/^Removing/, "Failed:")}. See terminal.`
              : pending.done
                ? pending.text.startsWith("Removed")
                  ? pending.text.replace(" It stays loaded until you reload the page.", "")
                  : pending.text.replace(/^Installing/, "Installed").replace(/^Removing/, "Removed")
                : `${pending.text}...`}
          </span>
        </p>
      ) : null}

      <section aria-label="Installed packages">
        <h3 className="mb-0.5 text-[9px] font-semibold uppercase tracking-wide text-fg-3">
          Installed{installedRows.length > 0 ? ` (${installedRows.length})` : ""}
        </h3>
        {installedRows.length === 0 ? (
          <p className="text-[10px] text-fg-3">{kind === "npm" && !folders.includes(folder) ? "No package.json yet." : "None."}</p>
        ) : (
          <ul className="max-h-40 divide-y divide-line overflow-y-auto rounded border border-line-strong">
            {installedRows.map((row) => (
              <li key={row.key} className="flex items-center gap-1 py-px pl-1.5 pr-0.5">
                <span className="min-w-0 truncate text-[11px] text-fg">{row.name}</span>
                {row.version ? <span className="shrink-0 text-[9px] text-fg-3">{row.version}</span> : null}
                {row.dev ? <span className="shrink-0 rounded bg-fg/[0.08] px-1 text-[9px] leading-[13px] text-fg-3">dev</span> : null}
                <button
                  type="button"
                  className="ml-auto flex size-4 shrink-0 items-center justify-center rounded text-fg-3 hover:bg-fg/[0.08] hover:text-danger focus-visible:outline-2 focus-visible:outline-ring"
                  aria-label={`Remove ${row.name}`}
                  title={`Remove ${row.name}`}
                  onClick={row.remove}
                >
                  <Trash2 size={10} aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
