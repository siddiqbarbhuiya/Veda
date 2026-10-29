import type { ReactNode } from "react";
import { Bot, Code2, Languages, LockKeyhole, Terminal, Wallet } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Section, SectionHeading } from "./section";

function Tile({
  icon: Icon,
  title,
  className = "",
  children,
  visual,
}: {
  icon: LucideIcon;
  title: string;
  className?: string;
  children: ReactNode;
  visual?: ReactNode;
}) {
  return (
    <li
      className={`flex flex-col min-w-0 rounded-2xl border border-line-strong bg-panel p-6 ${className}`}
    >
      <span className="flex size-11 items-center justify-center rounded-xl bg-accent-subtle text-accent-text">
        <Icon size={24} aria-hidden="true" />
      </span>
      <h3 className="mt-4 text-xl font-semibold">{title}</h3>
      <p className="mt-2 text-ui leading-relaxed text-fg-2 md:text-sm">{children}</p>
      {visual ? <div className="mt-auto pt-5">{visual}</div> : null}
    </li>
  );
}

const chip = "rounded-md border border-line bg-sunken px-2 py-1 font-mono text-caption text-fg-2";

export function Features() {
  return (
    <Section id="features" labelledBy="features-title">
      <SectionHeading
        id="features-title"
        overline="Features"
        title="Everything you need to write, run and debug"
        lead="No installs. No setup. Open a tab and start."
      />
      <ul className="mt-12 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Tile
          icon={Code2}
          title="A full IDE in your browser"
          className="md:col-span-2 lg:row-span-2"
          visual={
            <div aria-hidden="true">
              <div className="overflow-hidden rounded-xl border border-line bg-editor font-mono text-caption leading-6">
                <div className="flex items-center gap-2 border-b border-line bg-sunken px-3 py-1.5 text-fg-3">
                  <span className="size-2 rounded-full bg-danger" />
                  <span className="size-2 rounded-full bg-warning" />
                  <span className="size-2 rounded-full bg-success" />
                  <span className="ml-2">main.py</span>
                </div>
                <pre className="overflow-hidden whitespace-pre px-4 py-3 text-fg">
                  <span className="text-fg-3"># Sum of the first n numbers</span>
                  {"\n"}
                  <span className="text-accent-text">def</span> <span className="text-info">total</span>(n):
                  {"\n"}
                  {"    "}
                  <span className="text-accent-text">return</span> <span className="text-warning">sum</span>(
                  <span className="text-warning">range</span>(<span className="text-warning">1</span>, n + 1))
                  {"\n\n"}
                  <span className="text-warning">print</span>(<span className="text-info">total</span>(
                  <span className="text-warning">10</span>))
                  {"\n"}
                  <span className="text-success">55</span>
                </pre>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <span className={chip}>Editor</span>
                <span className={chip}>File tree</span>
                <span className={chip}>Terminal</span>
                <span className={chip}>AI chat</span>
              </div>
            </div>
          }
        >
          Edit files, keep a project tree and use a terminal. Use it for assignments, DSA practice,
          mini-projects and placement prep. Chrome or Edge on a laptop works best.
        </Tile>
        <Tile icon={LockKeyhole} title="Your key stays yours">
          We encrypt your AI key with AES-256-GCM before we store it. We decrypt it on our server only to make each AI call. We never show it to you again.
        </Tile>
        <Tile icon={Wallet} title="Pay as you go, in INR">
          Top up through Razorpay. Veda credit pays for each in-app AI call. We hold an estimate before the call,
          settle at the real cost and return the unused hold, to the paise.
        </Tile>
        <Tile icon={Terminal} title="Run Node.js and Python">
          Node.js runs through WebContainers. Python runs through Pyodide. Your code runs in your browser.
        </Tile>
        <Tile icon={Bot} title="AI that sees your file">
          The chat reads your open file. If requests come too fast, we pause them and show you a message.
        </Tile>
        <Tile
          icon={Languages}
          title="Works with Hindi and other Indic scripts"
          className="md:col-span-2 lg:col-span-4"
          visual={
            <div className="flex flex-wrap gap-2" aria-hidden="true">
              <span className={chip}>नमस्ते</span>
              <span className={chip}>নমস্কার</span>
              <span className={chip}>வணக்கம்</span>
            </div>
          }
        >
          Type your questions in Hindi, Bengali, Tamil or English. The chat input handles Indic script
          composition correctly.
        </Tile>
      </ul>
    </Section>
  );
}
