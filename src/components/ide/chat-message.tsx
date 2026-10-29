"use client";

import type { ReactNode } from "react";
import { LogoMark } from "@/components/ui/logo";
import { CodeBlock } from "./code-block";

type Block =
  | { kind: "code"; lang: string; code: string }
  | { kind: "list"; items: string[] }
  | { kind: "heading"; text: string }
  | { kind: "para"; text: string };

// Small markdown subset: fenced code, bullet lists, headings, paragraphs. Never produces HTML strings.
function parseBlocks(src: string): Block[] {
  const lines = src.replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];
  let para: string[] = [];
  let list: string[] = [];
  const flushPara = () => {
    if (para.length) blocks.push({ kind: "para", text: para.join("\n") });
    para = [];
  };
  const flushList = () => {
    if (list.length) blocks.push({ kind: "list", items: list });
    list = [];
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const fence = /^\s*```\s*([\w+#.-]*)\s*$/.exec(line);
    if (fence) {
      flushPara();
      flushList();
      const code: string[] = [];
      i++;
      // An unterminated fence (still streaming) runs to the end.
      while (i < lines.length && !/^\s*```\s*$/.test(lines[i])) code.push(lines[i++]);
      blocks.push({ kind: "code", lang: fence[1], code: code.join("\n") });
      continue;
    }
    const bullet = /^\s*(?:[-*]|\d+\.)\s+(.*)$/.exec(line);
    if (bullet) {
      flushPara();
      list.push(bullet[1]);
      continue;
    }
    flushList();
    const heading = /^\s{0,3}#{1,6}\s+(.*)$/.exec(line);
    if (heading) {
      flushPara();
      blocks.push({ kind: "heading", text: heading[1] });
    } else if (line.trim() === "") flushPara();
    else para.push(line);
  }
  flushPara();
  flushList();
  return blocks;
}

function Inline({ text }: { text: string }) {
  const parts = text.split(/(`[^`\n]+`|\*\*[^*\n]+\*\*)/g);
  return (
    <>
      {parts.map((p, i) => {
        if (p.length > 2 && p.startsWith("`") && p.endsWith("`"))
          return (
            <code key={i} className="rounded bg-sunken px-1 py-0.5 font-mono text-[0.92em] text-fg">
              {p.slice(1, -1)}
            </code>
          );
        if (p.length > 4 && p.startsWith("**") && p.endsWith("**"))
          return (
            <strong key={i} className="font-semibold text-fg">
              {p.slice(2, -2)}
            </strong>
          );
        return p;
      })}
    </>
  );
}

export function Markdown({ text }: { text: string }) {
  return (
    <div className="flex flex-col gap-2">
      {parseBlocks(text).map((b, i): ReactNode => {
        switch (b.kind) {
          case "code":
            return <CodeBlock key={i} code={b.code} language={b.lang} />;
          case "list":
            return (
              <ul key={i} className="list-disc space-y-1 pl-5 marker:text-fg-3">
                {b.items.map((it, j) => (
                  <li key={j} className="wrap-anywhere whitespace-pre-wrap">
                    <Inline text={it} />
                  </li>
                ))}
              </ul>
            );
          case "heading":
            return (
              <p key={i} className="wrap-anywhere font-semibold text-fg">
                <Inline text={b.text} />
              </p>
            );
          default:
            return (
              <p key={i} className="wrap-anywhere whitespace-pre-wrap">
                <Inline text={b.text} />
              </p>
            );
        }
      })}
    </div>
  );
}

export function ChatMessageView({
  role,
  content,
  streaming,
}: {
  role: "user" | "assistant" | "system";
  content: string;
  streaming: boolean;
}) {
  if (role === "user") {
    return (
      <div className="ml-auto max-w-[88%] animate-fade-in whitespace-pre-wrap wrap-anywhere rounded-lg bg-accent-subtle px-3 py-2 text-sm text-fg">
        {content}
      </div>
    );
  }
  return (
    <div className="flex animate-fade-in gap-2.5">
      <LogoMark size={20} className="mt-0.5" />
      <div className="min-w-0 flex-1 text-sm leading-relaxed text-fg-2">
        {content && <Markdown text={content} />}
        {streaming && (
          <span role="status" className="mt-1.5 flex items-center gap-1" aria-live="polite">
            <span className="sr-only">Generating…</span>
            {[0, 200, 400].map((d) => (
              <span
                key={d}
                aria-hidden="true"
                className="size-1.5 animate-dot-pulse rounded-full bg-accent-text"
                style={{ animationDelay: `${d}ms` }}
              />
            ))}
          </span>
        )}
      </div>
    </div>
  );
}
