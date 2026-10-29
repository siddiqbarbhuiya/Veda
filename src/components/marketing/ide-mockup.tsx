import type { ReactNode } from "react";
import { Bot, FileCode2, Files, Folder, Search, Settings, Sparkles, Terminal } from "lucide-react";

function Line({ n, children }: { n: number; children?: ReactNode }) {
  return (
    <div className="flex gap-4 whitespace-pre">
      <span className="tnum w-4 select-none text-right text-fg-3">{n}</span>
      <span className="text-fg">{children}</span>
    </div>
  );
}

const kw = "text-accent-text";

const files = [
  { name: "main.js", active: true },
  { name: "utils.js", active: false },
  { name: "notes.py", active: false },
];

export function IdeMockup() {
  return (
    <figure className="relative mx-auto mt-14 w-full max-w-5xl md:mt-20">
      <style>{`@keyframes veda-blink{0%,49%{opacity:1}50%,100%{opacity:0}}`}</style>
      <div aria-hidden="true" className="overflow-hidden rounded-2xl border border-line-strong bg-app shadow-glow">
        <div className="flex h-10 items-center gap-2 border-b border-line bg-elevated px-4">
          <span className="size-3 rounded-full bg-danger" />
          <span className="size-3 rounded-full bg-warning" />
          <span className="size-3 rounded-full bg-success" />
          <span className="mx-auto text-caption text-fg-3">veda: binary-search</span>
        </div>
        <div className="flex h-[340px] md:h-[400px]">
          <div className="hidden w-11 shrink-0 flex-col items-center gap-4 border-r border-line bg-app py-3 text-fg-3 sm:flex">
            <Files size={18} className="text-fg" />
            <Search size={18} />
            <Sparkles size={18} />
            <Settings size={18} className="mt-auto" />
          </div>
          <div className="hidden w-40 shrink-0 border-r border-line bg-panel p-3 text-ui md:block">
            <p className="mb-2 text-overline font-semibold uppercase tracking-[0.08em] text-fg-3">Explorer</p>
            <p className="flex items-center gap-1.5 py-1 text-fg-2">
              <Folder size={14} /> dsa-practice
            </p>
            {files.map((f) => (
              <p
                key={f.name}
                className={`ml-4 flex items-center gap-1.5 rounded px-1.5 py-1 ${
                  f.active ? "bg-accent-subtle text-fg" : "text-fg-2"
                }`}
              >
                <FileCode2 size={14} className={f.active ? kw : "text-fg-3"} /> {f.name}
              </p>
            ))}
          </div>
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="flex h-9 shrink-0 items-end border-b border-line bg-sunken text-ui">
              <span className="flex h-full items-center gap-1.5 border-r border-line bg-editor px-3 text-fg">
                <FileCode2 size={14} className={kw} /> main.js
              </span>
              <span className="flex h-full items-center px-3 text-fg-3">utils.js</span>
            </div>
            <div className="flex-1 overflow-hidden bg-editor p-4 font-mono text-[13px] leading-6">
              <Line n={1}>
                <span className="text-fg-3">{"// Assignment 4: binary search"}</span>
              </Line>
              <Line n={2}>
                <span className={kw}>function</span> <span className="text-info">search</span>(arr, target) {"{"}
              </Line>
              <Line n={3}>
                {"  "}
                <span className={kw}>let</span> lo = <span className="text-warning">0</span>, hi = arr.length -{" "}
                <span className="text-warning">1</span>;
              </Line>
              <Line n={4}>
                {"  "}
                <span className={kw}>while</span> (lo {"<="} hi) {"{"}
              </Line>
              <Line n={5}>
                {"    "}
                <span className={kw}>const</span> mid = Math.<span className="text-info">floor</span>((lo + hi) /{" "}
                <span className="text-warning">2</span>);
              </Line>
              <Line n={6}>
                {"    "}
                <span className={kw}>if</span> (arr[mid] === target) <span className={kw}>return</span> mid;
              </Line>
              <Line n={7}>{"  }"}</Line>
              <Line n={8}>
                {"  "}
                <span className={kw}>return</span> <span className="text-warning">-1</span>;
                <span
                  className="ml-px inline-block h-4 w-[2px] translate-y-0.5 bg-accent-text"
                  style={{ animation: "veda-blink 1s steps(1) infinite" }}
                />
              </Line>
            </div>
            <div className="shrink-0 border-t border-line bg-panel px-4 py-2.5 font-mono text-caption">
              <p className="mb-1 flex items-center gap-1.5 font-sans text-overline font-semibold uppercase tracking-[0.08em] text-fg-3">
                <Terminal size={12} /> Terminal
              </p>
              <p className="text-fg-2">
                <span className="text-success">$</span> node main.js
              </p>
              <p className="text-success">Found at index 3</p>
            </div>
          </div>
          <div className="hidden w-64 shrink-0 flex-col gap-3 border-l border-line bg-panel p-3 text-ui lg:flex">
            <p className="flex items-center gap-1.5 text-overline font-semibold uppercase tracking-[0.08em] text-fg-3">
              <Bot size={14} /> AI chat
            </p>
            <p className="self-end rounded-xl rounded-br-sm bg-accent px-3 py-2 text-accent-fg">
              Why does my loop never end?
            </p>
            <p className="rounded-xl rounded-bl-sm border border-line bg-elevated px-3 py-2 text-fg-2">
              You never change lo or hi inside the loop. Add lo = mid + 1 or hi = mid - 1.
            </p>
            <p className="mt-auto text-caption text-fg-3">
              Cost: <span className="tnum text-success">12 paise</span>
            </p>
          </div>
        </div>
      </div>
      <figcaption className="sr-only">
        A mock-up of the Veda editor. It shows a file list, a JavaScript binary search file, a terminal that
        prints a result, and an AI chat that explains a bug.
      </figcaption>
    </figure>
  );
}
