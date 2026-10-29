import { Bot, Code2, SquareTerminal } from "lucide-react";
import { LogoMark } from "@/components/ui/logo";

const panel = "launch-layer rounded-xl border border-line-strong bg-panel p-3 shadow-e2";
const panelTitle = "mb-2 flex items-center gap-1.5 text-caption font-medium text-fg-2";

// Each line reveals in turn (--i) and the cycle repeats. Colors are semantic tokens, so both themes work.
const CODE = [
  [
    ["text-accent-text", "def "],
    ["text-info", "greet"],
    ["text-fg-2", "(name):"],
  ],
  [
    ["text-fg-3", "  "],
    ["text-accent-text", "return "],
    ["text-success", 'f"Hi {name}"'],
  ],
  [
    ["text-info", "print"],
    ["text-fg-2", "("],
    ["text-info", "greet"],
    ["text-fg-2", "("],
    ["text-success", '"Veda"'],
    ["text-fg-2", "))"],
  ],
] as const;

/* Decorative 3D scene shared by the pop-up and the home page banner. */
export function LaunchScene() {
  return (
    <div className="launch-stage" aria-hidden="true">
      <div className="launch-glow" />
      <div className="launch-scene">
        <div className={`${panel} launch-layer-back`}>
          <div className={panelTitle}>
            <SquareTerminal size={14} />
            Terminal
          </div>
          <pre className="font-mono text-caption leading-[18px] text-fg-3">
            {"$ python main.py\n"}
            <span className="launch-code-line text-success" style={{ ["--i" as string]: 4 }}>
              Hi Veda
            </span>
          </pre>
        </div>

        <div className={`${panel} launch-layer-mid`}>
          <div className={panelTitle}>
            <Code2 size={14} />
            main.py
          </div>
          <pre className="font-mono text-caption leading-[18px]">
            {CODE.map((line, i) => (
              <span key={i} className="launch-code-line block" style={{ ["--i" as string]: i }}>
                {line.map(([tone, text], j) => (
                  <span key={j} className={tone}>
                    {text}
                  </span>
                ))}
                {i === CODE.length - 1 ? (
                  <span className="ml-0.5 inline-block h-3 w-1.5 translate-y-0.5 animate-blink bg-accent-text" />
                ) : null}
              </span>
            ))}
          </pre>
        </div>

        <div className={`${panel} launch-layer-front`}>
          <div className={panelTitle}>
            <Bot size={14} />
            AI chat
          </div>
          <div className="mb-2 h-1.5 w-4/5 rounded-full bg-fg/[0.12]" />
          <div className="mb-3 h-1.5 w-3/5 rounded-full bg-fg/[0.12]" />
          <div className="flex gap-1">
            {[0, 1, 2].map((n) => (
              <span
                key={n}
                className="size-1.5 animate-dot-pulse rounded-full bg-accent-text"
                style={{ animationDelay: `${n * 160}ms` }}
              />
            ))}
          </div>
        </div>

        <div className="launch-mark">
          <LogoMark size={56} />
        </div>
      </div>
    </div>
  );
}
