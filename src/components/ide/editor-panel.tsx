"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Editor, { type Monaco } from "@monaco-editor/react";
import { ChevronRight } from "lucide-react";
import { useFileSystem, findNode } from "@/hooks/use-file-system";
import { useTheme } from "@/components/ui/theme";
import { Skeleton } from "@/components/ui/skeleton";
import { Kbd } from "@/components/ui/kbd";
import { LogoMark } from "@/components/ui/logo";
import { cn } from "@/lib/cn";
import { EditorTabs, FILE_OPENED_EVENT } from "./editor-tabs";
import { applyVedaTheme, editorFontFamily } from "./monaco-theme";

const LANGS: Record<string, string> = {
  js: "javascript", jsx: "javascript", mjs: "javascript", cjs: "javascript",
  ts: "typescript", tsx: "typescript", json: "json", md: "markdown",
  py: "python", html: "html", css: "css", sh: "shell", yml: "yaml", yaml: "yaml",
};

export function languageFor(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  return LANGS[ext] ?? "plaintext";
}

const nameOf = (path: string) => path.split("/").pop() ?? path;

const SKELETON_WIDTHS = ["w-1/3", "w-2/3", "w-1/2", "w-3/4", "w-1/4", "w-3/5", "w-2/5", "w-1/2"];

function EditorSkeleton() {
  return (
    <div role="status" className="flex h-full w-full flex-col gap-3 bg-editor px-6 py-4">
      <span className="sr-only">Loading editor</span>
      {SKELETON_WIDTHS.map((w, i) => (
        <Skeleton key={i} className={cn("h-3.5", w)} />
      ))}
    </div>
  );
}

function EmptyState() {
  const shortcuts: Array<[string[], string]> = [
    [["Ctrl", "K"], "Command palette"],
    [["Ctrl", "Enter"], "Run code"],
    [["Alt", "N"], "New file"],
  ];
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-6 bg-editor px-6 text-center">
      <LogoMark size={48} />
      <p className="text-base font-medium text-fg">Open a file to start coding</p>
      <ul className="flex flex-col gap-2 text-ui text-fg-2">
        {shortcuts.map(([keys, label]) => (
          <li key={label} className="flex items-center justify-between gap-6">
            <span>{label}</span>
            <span className="flex items-center gap-1">
              {keys.map((k) => (
                <Kbd key={k}>{k}</Kbd>
              ))}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Breadcrumbs({ path }: { path: string }) {
  const parts = path.split("/");
  return (
    <nav aria-label="Breadcrumb" className="flex h-6 shrink-0 items-center gap-0.5 overflow-hidden border-b border-line bg-editor px-3 text-caption text-fg-3">
      {parts.map((p, i) => (
        <span key={i} className="flex min-w-0 items-center gap-0.5">
          {i > 0 && <ChevronRight size={12} aria-hidden="true" className="shrink-0" />}
          <span className={cn("truncate", i === parts.length - 1 && "text-fg-2")} aria-current={i === parts.length - 1 ? "page" : undefined}>
            {p}
          </span>
        </span>
      ))}
    </nav>
  );
}

export default function EditorPanel() {
  const { files, activeFile, openFile, updateFileContent } = useFileSystem();
  const theme = useTheme();
  const monacoRef = useRef<Monaco | null>(null);
  const fontFamily = useMemo(() => (typeof document === "undefined" ? "monospace" : editorFontFamily()), []);

  // Tabs = files opened this session. The hook has no tab list, so it is tracked here.
  const [tabPaths, setTabPaths] = useState<string[]>([]);
  const [dismissed, setDismissed] = useState<string | null>(null);
  const activePath = activeFile && activeFile.type === "file" ? activeFile.path : null;

  // Derived-state updates during render: add the active file, drop files that no longer exist.
  const nextTabs = tabPaths.filter((p) => findNode(files, p));
  if (activePath && !nextTabs.includes(activePath) && dismissed !== activePath) nextTabs.push(activePath);
  if (nextTabs.length !== tabPaths.length || nextTabs.some((p, i) => p !== tabPaths[i])) setTabPaths(nextTabs);
  if (dismissed && dismissed !== activePath) setDismissed(null);

  useEffect(() => {
    const onOpened = () => setDismissed(null);
    window.addEventListener(FILE_OPENED_EVENT, onOpened);
    return () => window.removeEventListener(FILE_OPENED_EVENT, onOpened);
  }, []);

  useEffect(() => {
    if (monacoRef.current) applyVedaTheme(monacoRef.current, theme);
  }, [theme]);

  const closeTab = (path: string) => {
    const i = tabPaths.indexOf(path);
    const rest = tabPaths.filter((p) => p !== path);
    setTabPaths(rest);
    if (path !== activePath) return;
    const neighbour = rest[i] ?? rest[i - 1];
    if (neighbour) openFile(neighbour);
    else setDismissed(path);
  };

  const showEmpty = !activeFile || activeFile.type !== "file" || dismissed === activeFile.path;
  const tabs = tabPaths.map((p) => ({ path: p, name: nameOf(p) }));

  return (
    <div id="editor-panel" className="flex h-full min-h-0 w-full flex-col bg-editor">
      {tabs.length > 0 ? (
        <EditorTabs tabs={tabs} activePath={showEmpty ? null : activePath} onSelect={openFile} onClose={closeTab} />
      ) : (
        <div aria-hidden="true" className="h-9 shrink-0 border-b border-line bg-sunken" />
      )}
      {showEmpty ? (
        <EmptyState />
      ) : (
        <>
          <Breadcrumbs path={activeFile.path} />
          <div className="min-h-0 flex-1">
            <Editor
              height="100%"
              theme={`veda-${theme}`}
              path={activeFile.path}
              language={languageFor(activeFile.name)}
              value={activeFile.content ?? ""}
              onChange={(v) => updateFileContent(activeFile.path, v ?? "")}
              loading={<EditorSkeleton />}
              beforeMount={(monaco) => {
                monacoRef.current = monaco;
                applyVedaTheme(monaco, theme);
              }}
              onMount={(_editor, monaco) => {
                monacoRef.current = monaco;
                document.fonts?.ready.then(() => monaco.editor.remeasureFonts());
              }}
              options={{
                automaticLayout: true,
                fontFamily,
                fontSize: 14,
                lineHeight: 22,
                fontLigatures: true,
                minimap: { enabled: false },
                bracketPairColorization: { enabled: true },
                smoothScrolling: true,
                cursorSmoothCaretAnimation: "on",
                padding: { top: 12 },
                renderLineHighlight: "line",
                scrollBeyondLastLine: false,
                fixedOverflowWidgets: true,
              }}
            />
          </div>
        </>
      )}
    </div>
  );
}
