import type { ReactNode } from "react";
import { LEGAL_UPDATED } from "@/lib/site";

export type LegalSection = { id: string; title: string; body: ReactNode };

// Marks text that the owner must fill before the page is final. Visible on purpose.
export function Ph({ children }: { children: string }) {
  return (
    <mark className="rounded bg-warning-subtle px-1 font-medium text-warning">[{children}]</mark>
  );
}

export function LegalPage({
  title,
  intro,
  sections,
}: {
  title: string;
  intro: ReactNode;
  sections: LegalSection[];
}) {
  const updated = new Date(`${LEGAL_UPDATED}T00:00:00Z`);
  const updatedLabel = new Intl.DateTimeFormat("en-IN", { dateStyle: "long", timeZone: "UTC" }).format(updated);
  return (
    <article className="mx-auto w-full max-w-3xl px-4 py-12 md:px-6 md:py-20">
      <h1 className="font-display text-[clamp(32px,5vw,44px)] font-bold leading-tight tracking-[-0.02em]">
        {title}
      </h1>
      <p className="mt-3 text-ui text-fg-3">
        Last updated: <time dateTime={LEGAL_UPDATED}>{updatedLabel}</time>
      </p>
      <div className="mt-6 space-y-4 text-fg-2">{intro}</div>

      <nav aria-label="On this page" className="mt-8 rounded-xl border border-line-strong bg-panel p-5">
        <p className="text-caption font-semibold uppercase tracking-[0.08em] text-fg-3">On this page</p>
        <ol className="mt-3 list-decimal space-y-1 pl-5 text-fg-2 marker:text-fg-3">
          {sections.map((s) => (
            <li key={s.id}>
              <a href={`#${s.id}`} className="inline-flex min-h-11 items-center text-accent-text hover:underline md:min-h-0">
                {s.title}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      <div className="mt-10 space-y-10">
        {sections.map((s) => (
          <section key={s.id} id={s.id} aria-labelledby={`${s.id}-title`} className="scroll-mt-20">
            <h2 id={`${s.id}-title`} className="font-display text-2xl font-semibold tracking-[-0.01em]">
              {s.title}
            </h2>
            <div className="mt-3 space-y-3 text-fg-2 [&_a]:text-accent-text [&_a]:underline [&_li]:pl-1 [&_strong]:text-fg [&_ul]:list-disc [&_ul]:space-y-1.5 [&_ul]:pl-5">
              {s.body}
            </div>
          </section>
        ))}
      </div>
    </article>
  );
}
