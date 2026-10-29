import { cn } from "@/lib/cn";

const R = 7;
const CIRC = 2 * Math.PI * R;

const compact = (n: number) => (n >= 1_000_000 ? `${Math.round(n / 100_000) / 10}M` : n >= 1000 ? `${Math.round(n / 100) / 10}K` : String(n));

/**
 * A small ring that shows how much of the model's context is used.
 * The text is a tooltip and a label for screen readers, so the ring is never the only signal.
 */
export function ContextRing({ used, limit, className }: { used: number; limit: number; className?: string }) {
  const ratio = limit > 0 ? Math.min(1, Math.max(0, used / limit)) : 0;
  const percent = Math.round(ratio * 100);
  const text = `Context: about ${percent}% used (${compact(used)} of ${compact(limit)} tokens)`;
  return (
    <span role="img" aria-label={text} title={text} className={cn("flex size-5 shrink-0 items-center justify-center", className)}>
      <svg width="16" height="16" viewBox="0 0 20 20" aria-hidden="true" className="-rotate-90">
        <circle cx="10" cy="10" r={R} fill="none" strokeWidth="2.5" className="stroke-fg-3/35" />
        <circle
          cx="10"
          cy="10"
          r={R}
          fill="none"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeDasharray={CIRC}
          strokeDashoffset={CIRC * (1 - ratio)}
          className={cn("transition-[stroke-dashoffset] duration-300", ratio >= 0.85 ? "stroke-warning" : "stroke-accent-text")}
        />
      </svg>
    </span>
  );
}
