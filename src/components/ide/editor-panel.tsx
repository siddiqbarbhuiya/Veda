"use client";

import { useEffect, useMemo, useRef } from "react";
import Editor, { type Monaco, type OnMount } from "@monaco-editor/react";
import { ChevronRight } from "lucide-react";
import { useFileSystem, findNode } from "@/hooks/use-file-system";
import { languageFor } from "./language";
import { useTheme } from "@/components/ui/theme";
import { Skeleton } from "@/components/ui/skeleton";
import { Kbd } from "@/components/ui/kbd";
import { LogoMark } from "@/components/ui/logo";
import { cn } from "@/lib/cn";
import { EditorTabs } from "./editor-tabs";
import { applyVedaTheme, editorFontFamily } from "./monaco-theme";

export { languageFor };

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

function Breadcrumbs({ path, readOnly }: { path: string; readOnly: boolean }) {
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
      {readOnly && <span className="ml-auto shrink-0 pl-2 text-fg-3">Read-only</span>}
    </nav>
  );
}

export default function EditorPanel() {
  const { treeFiles, activeFile, openTabs, openFile, closeTab, updateFileContent, flushNow } = useFileSystem();
  const theme = useTheme();
  const monacoRef = useRef<Monaco | null>(null);
  const editorRef = useRef<Parameters<OnMount>[0] | null>(null);
  const flushRef = useRef(flushNow);
  const fontFamily = useMemo(() => (typeof document === "undefined" ? "monospace" : editorFontFamily()), []);

  useEffect(() => {
    flushRef.current = flushNow;
  }, [flushNow]);

  useEffect(() => {
    if (monacoRef.current) applyVedaTheme(monacoRef.current, theme);
  }, [theme]);

  // Dispose the Monaco model of every file that has no tab any more (closed, deleted or renamed).
  useEffect(() => {
    const monaco = monacoRef.current;
    if (!monaco) return;
    const keep = new Set(openTabs.map((p) => monaco.Uri.parse(p).toString()));
    const attached = editorRef.current?.getModel();
    for (const model of monaco.editor.getModels()) {
      if (model !== attached && !keep.has(model.uri.toString())) model.dispose();
    }
  }, [openTabs]);

  const showEmpty = !activeFile || activeFile.type !== "file";
  const tabs = openTabs.filter((p) => findNode(treeFiles, p)).map((p) => ({ path: p, name: nameOf(p) }));
  const activePath = showEmpty ? null : activeFile.path;

  return (
    <div id="editor-panel" className="flex h-full min-h-0 w-full flex-col bg-editor">
      {tabs.length > 0 ? (
        <EditorTabs tabs={tabs} activePath={activePath} onSelect={openFile} onClose={closeTab} />
      ) : (
        <div aria-hidden="true" className="h-9 shrink-0 border-b border-line bg-sunken" />
      )}
      {showEmpty ? (
        <EmptyState />
      ) : (
        <>
          <Breadcrumbs path={activeFile.path} readOnly={activeFile.readOnly === true} />
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
              onMount={(editor, monaco) => {
                monacoRef.current = monaco;
                editorRef.current = editor;
                // Ctrl+S saves the project and stops the browser "save page" dialog.
                editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => void flushRef.current());
                document.fonts?.ready.then(() => monaco.editor.remeasureFonts());
              }}
              options={{
                readOnly: activeFile.readOnly === true,
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
