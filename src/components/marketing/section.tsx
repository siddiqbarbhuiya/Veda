import type { ReactNode } from "react";

export function SectionHeading({
  id,
  overline,
  title,
  lead,
}: {
  id: string;
  overline: string;
  title: string;
  lead?: string;
}) {
  return (
    <div className="mx-auto max-w-2xl text-center">
      <p className="text-caption font-semibold uppercase tracking-[0.08em] text-accent-text">{overline}</p>
      <h2 id={id} className="mt-3 font-display text-[28px] font-semibold leading-tight tracking-[-0.02em] md:text-4xl">
        {title}
      </h2>
      {lead ? <p className="mt-4 text-fg-2">{lead}</p> : null}
    </div>
  );
}

export function Section({
  id,
  labelledBy,
  children,
}: {
  id: string;
  labelledBy: string;
  children: ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={labelledBy} className="py-16 md:py-24">
      <div className="mx-auto w-full max-w-6xl px-4 md:px-6">{children}</div>
    </section>
  );
}
