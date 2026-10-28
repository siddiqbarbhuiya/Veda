"use client";

import Editor from "@monaco-editor/react";
import { useFileSystem } from "@/hooks/use-file-system";

const LANGS: Record<string, string> = {
  js: "javascript", jsx: "javascript", mjs: "javascript", cjs: "javascript",
  ts: "typescript", tsx: "typescript", json: "json", md: "markdown",
  py: "python", html: "html", css: "css", sh: "shell", yml: "yaml", yaml: "yaml",
};

export function languageFor(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  return LANGS[ext] ?? "plaintext";
}

export default function EditorPanel() {
  const { activeFile, updateFileContent } = useFileSystem();

  if (!activeFile || activeFile.type !== "file") {
    return (
      <div id="editor-panel" className="flex h-full items-center justify-center text-sm text-neutral-500">
        Select a file to edit
      </div>
    );
  }

  return (
    <div id="editor-panel" className="flex h-full flex-col">
      <div className="border-b border-neutral-800 bg-neutral-900 px-3 py-1 text-xs">{activeFile.path}</div>
      <div className="min-h-0 flex-1">
        <Editor
          height="100%"
          theme="vs-dark"
          path={activeFile.path}
          language={languageFor(activeFile.name)}
          value={activeFile.content ?? ""}
          onChange={(v) => updateFileContent(activeFile.path, v ?? "")}
          options={{ minimap: { enabled: false }, fontSize: 14, automaticLayout: true }}
        />
      </div>
    </div>
  );
}
