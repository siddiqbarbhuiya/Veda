import { cn } from "@/lib/cn";

export function LogoMark({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
      className={cn("shrink-0", className)}
    >
      <rect width="32" height="32" rx="8" fill="var(--accent)" />
      <path
        d="M8.5 9.5 16 22.5l7.5-13"
        stroke="var(--accent-fg)"
        strokeWidth="2.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <rect x="20" y="23" width="6" height="2.4" rx="1.2" fill="var(--accent-fg)" fillOpacity="0.75" />
    </svg>
  );
}

export function Logo({
  size = 28,
  showWordmark = true,
  className,
}: {
  size?: number;
  showWordmark?: boolean;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <LogoMark size={size} />
      {showWordmark ? (
        <span className="font-display text-lg font-semibold tracking-[-0.02em] text-fg">Veda</span>
      ) : (
        <span className="sr-only">Veda</span>
      )}
    </span>
  );
}
