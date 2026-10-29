import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

export const cardClass = "rounded-xl border border-line-strong bg-panel shadow-e1";

export function Card({ className, ...rest }: ComponentProps<"div">) {
  return <div className={cn(cardClass, className)} {...rest} />;
}

export function SectionLabel({ className, ...rest }: ComponentProps<"h2">) {
  return (
    <h2
      className={cn("text-overline font-semibold uppercase tracking-[0.08em] text-fg-3", className)}
      {...rest}
    />
  );
}
