"use client";

import { memo, useMemo, type ReactNode } from "react";
import { LogoMark } from "@/components/ui/logo";
import { CodeBlock } from "./code-block";

type ListItem = { text: string; sub?: ListBlock };
type ListBlock = { kind: "list"; ordered: boolean; start: number; items: ListItem[] };
type Block =
  | { kind: "code"; lang: string; code: string }
  | ListBlock
  | { kind: "heading"; level: number; text: string }
  | { kind: "quote"; blocks: Block[] }
  | { kind: "hr" }
  | { kind: "table"; head: string[]; rows: string[][] }
  | { kind: "para"; text: string };

const FENCE = /^\s*(`{3,}|~{3,})\s*([\w+#.-]*)[^\n]*$/;
const LIST_LINE = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;
const HR = /^\s{0,3}([-*_])(?:\s*\1){2,}\s*$/;
const TABLE_SEP = /^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)*\|?\s*$/;

function splitRow(line: string): string[] {
  let t = line.trim();
  if (t.startsWith("|")) t = t.slice(1);
  if (t.endsWith("|")) t = t.slice(0, -1);
  return t.split("|").map((c) => c.trim());
}

const indentOf = (ws: string) => ws.replace(/\t/g, "    ").length;

type ListEntry = { indent: number; ordered: boolean; num: number; text: string };

function buildList(entries: ListEntry[], pos: { i: number }, base: number): ListBlock {
  const first = entries[pos.i];
  const list: ListBlock = { kind: "list", ordered: first.ordered, start: first.num, items: [] };
  while (pos.i < entries.length) {
    const e = entries[pos.i];
    if (e.indent < base) break;
    const last = list.items[list.items.length - 1];
    if (e.indent > base && last) {
      last.sub = buildList(entries, pos, e.indent);
      continue;
    }
    list.items.push({ text: e.text });
    pos.i++;
  }
  return list;
}

// Small markdown subset. Never produces HTML strings: output is React elements only.
export function parseBlocks(src: string): Block[] {
  const lines = src.replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];
  let para: string[] = [];
  let entries: ListEntry[] = [];
  const flushPara = () => {
    if (para.length) blocks.push({ kind: "para", text: para.join("\n") });
    para = [];
  };
  const flushList = () => {
    const pos = { i: 0 };
    while (pos.i < entries.length) blocks.push(buildList(entries, pos, entries[pos.i].indent));
    entries = [];
  };
  const nextNonBlank = (from: number) => {
    let j = from;
    while (j < lines.length && lines[j].trim() === "") j++;
    return j < lines.length ? lines[j] : null;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const fence = FENCE.exec(line);
    if (fence) {
      flushPara();
      flushList();
      const marker = fence[1];
      const code: string[] = [];
      i++;
      // The closing fence uses the same character and is at least as long.
      // An unterminated fence (still streaming) runs to the end.
      while (i < lines.length) {
        const t = lines[i].trim();
        if (t.length >= marker.length && t[0] === marker[0] && /^(`+|~+)$/.test(t)) break;
        code.push(lines[i++]);
      }
      blocks.push({ kind: "code", lang: fence[2], code: code.join("\n") });
      continue;
    }

    // A rule is only repeated markers ("---", "***", "- - -"), so "- item" stays a list item.
    if (HR.test(line)) {
      flushPara();
      flushList();
      blocks.push({ kind: "hr" });
      continue;
    }

    const item = LIST_LINE.exec(line);
    if (item) {
      flushPara();
      const marker = item[2];
      const ordered = /\d/.test(marker);
      entries.push({
        indent: indentOf(item[1]),
        ordered,
        num: ordered ? parseInt(marker, 10) : 1,
        text: item[3],
      });
      continue;
    }

    if (entries.length) {
      if (line.trim() === "") {
        // A blank line between items keeps the list together.
        const nxt = nextNonBlank(i + 1);
        if (nxt !== null && LIST_LINE.test(nxt)) continue;
        flushList();
        continue;
      }
      if (/^\s{2,}\S/.test(line) && !FENCE.test(line)) {
        // Indented continuation of the last item.
        entries[entries.length - 1].text += `\n${line.trim()}`;
        continue;
      }
      flushList();
    }

    const heading = /^\s{0,3}(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      flushPara();
      blocks.push({ kind: "heading", level: heading[1].length, text: heading[2].replace(/\s+#+\s*$/, "") });
      continue;
    }

    if (/^\s{0,3}>/.test(line)) {
      flushPara();
      const quoted: string[] = [];
      while (i < lines.length && /^\s{0,3}>/.test(lines[i])) {
        quoted.push(lines[i].replace(/^\s{0,3}>\s?/, ""));
        i++;
      }
      i--;
      blocks.push({ kind: "quote", blocks: parseBlocks(quoted.join("\n")) });
      continue;
    }

    if (line.includes("|") && i + 1 < lines.length && TABLE_SEP.test(lines[i + 1]) && lines[i + 1].includes("-")) {
      flushPara();
      const head = splitRow(line);
      const rows: string[][] = [];
      i += 2;
      while (i < lines.length && lines[i].trim() !== "" && lines[i].includes("|")) {
        rows.push(splitRow(lines[i]));
        i++;
      }
      i--;
      blocks.push({ kind: "table", head, rows });
      continue;
    }

    if (line.trim() === "") flushPara();
    else para.push(line);
  }
  flushPara();
  flushList();
  return blocks;
}

const INLINE =
  /(`[^`\n]+`|\[[^\]\n]+\]\([^)\s]+\)|\*\*[^*\n]+?\*\*|~~[^~\n]+?~~|\*[^*\s](?:[^*\n]*[^*\s])?\*|(?<![\w])_[^_\n]+_(?![\w]))/g;

function Inline({ text }: { text: string }) {
  const parts = text.split(INLINE);
  return (
    <>
      {parts.map((p, i): ReactNode => {
        if (i % 2 === 0) return p;
        if (p.startsWith("`"))
          return (
            <code key={i} className="rounded bg-sunken px-1 py-0.5 font-mono text-[0.92em] text-fg">
              {p.slice(1, -1)}
            </code>
          );
        if (p.startsWith("[")) {
          const m = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(p);
          if (!m) return p;
          // Only http and https links are clickable. Anything else renders as plain text.
          if (!/^https?:\/\//i.test(m[2])) return <Inline key={i} text={m[1]} />;
          return (
            <a
              key={i}
              href={m[2]}
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent-text underline underline-offset-2 hover:text-fg"
            >
              <Inline text={m[1]} />
            </a>
          );
        }
        if (p.startsWith("**"))
          return (
            <strong key={i} className="font-semibold text-fg">
              <Inline text={p.slice(2, -2)} />
            </strong>
          );
        if (p.startsWith("~~"))
          return (
            <del key={i}>
              <Inline text={p.slice(2, -2)} />
            </del>
          );
        return (
          <em key={i}>
            <Inline text={p.slice(1, -1)} />
          </em>
        );
      })}
    </>
  );
}

function ListView({ list }: { list: ListBlock }) {
  const Tag = list.ordered ? "ol" : "ul";
  return (
    <Tag
      start={list.ordered ? list.start : undefined}
      className={`${list.ordered ? "list-decimal" : "list-disc"} space-y-1 pl-5 marker:text-fg-3`}
    >
      {list.items.map((it, j) => (
        <li key={j} className="wrap-anywhere whitespace-pre-wrap">
          <Inline text={it.text} />
          {it.sub && <ListView list={it.sub} />}
        </li>
      ))}
    </Tag>
  );
}

const HEADING_CLASS = "wrap-anywhere font-semibold text-fg";

function Blocks({ blocks, streaming }: { blocks: Block[]; streaming: boolean }) {
  return (
    <>
      {blocks.map((b, i): ReactNode => {
        switch (b.kind) {
          case "code":
            return <CodeBlock key={i} code={b.code} language={b.lang} streaming={streaming && i === blocks.length - 1} />;
          case "list":
            return <ListView key={i} list={b} />;
          case "heading": {
            const content = <Inline text={b.text} />;
            if (b.level <= 1)
              return (
                <h3 key={i} className={`${HEADING_CLASS} text-base`}>
                  {content}
                </h3>
              );
            if (b.level === 2)
              return (
                <h4 key={i} className={HEADING_CLASS}>
                  {content}
                </h4>
              );
            return (
              <h5 key={i} className={HEADING_CLASS}>
                {content}
              </h5>
            );
          }
          case "quote":
            return (
              <blockquote key={i} className="flex flex-col gap-2 border-l-2 border-line-strong pl-3 text-fg-3">
                <Blocks blocks={b.blocks} streaming={false} />
              </blockquote>
            );
          case "hr":
            return <hr key={i} className="border-line" />;
          case "table":
            return (
              <div key={i} className="overflow-x-auto">
                <table className="w-full border-collapse text-caption">
                  <thead>
                    <tr>
                      {b.head.map((h, j) => (
                        <th key={j} className="border border-line bg-sunken px-2 py-1 text-left font-semibold text-fg">
                          <Inline text={h} />
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {b.rows.map((row, r) => (
                      <tr key={r}>
                        {row.map((c, j) => (
                          <td key={j} className="border border-line px-2 py-1 align-top">
                            <Inline text={c} />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          default:
            return (
              <p key={i} className="wrap-anywhere whitespace-pre-wrap">
                <Inline text={b.text} />
              </p>
            );
        }
      })}
    </>
  );
}

export function Markdown({ text, streaming = false }: { text: string; streaming?: boolean }) {
  const blocks = useMemo(() => parseBlocks(text), [text]);
  return (
    <div className="flex flex-col gap-2">
      <Blocks blocks={blocks} streaming={streaming} />
    </div>
  );
}

function ChatMessageViewBase({
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
        {content && <Markdown text={content} streaming={streaming} />}
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

// Memoized: only the streaming message re-renders (and re-parses) on each chunk.
export const ChatMessageView = memo(ChatMessageViewBase);
