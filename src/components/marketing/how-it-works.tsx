import { Section, SectionHeading } from "./section";

const steps = [
  {
    title: "Add your key",
    body: "Paste your OpenAI, Anthropic or Google Gemini key. We encrypt it and never show it again.",
  },
  {
    title: "Top up if you want",
    body: "Add ₹29, ₹49 or ₹99 with UPI. This step is optional until you use the in-app AI.",
  },
  {
    title: "Open the IDE",
    body: "Write code, run it in your browser and ask the AI about the file that you have open.",
  },
];

export function HowItWorks() {
  return (
    <Section id="how-it-works" labelledBy="how-title">
      <SectionHeading id="how-title" overline="How it works" title="From sign-in to first run in three steps" />
      <ol className="relative mt-14 grid gap-10 md:grid-cols-3 md:gap-8">
        <div
          aria-hidden="true"
          className="absolute left-[16.67%] right-[16.67%] top-6 hidden h-px bg-line-strong md:block"
        />
        {steps.map((s, i) => (
          <li key={s.title} className="relative flex flex-col items-center text-center">
            <span className="tnum relative flex size-12 items-center justify-center rounded-full border border-accent bg-panel font-display text-lg font-semibold text-accent-text shadow-e1">
              {i + 1}
            </span>
            <h3 className="mt-5 text-xl font-semibold">{s.title}</h3>
            <p className="mt-2 max-w-xs text-fg-2">{s.body}</p>
          </li>
        ))}
      </ol>
    </Section>
  );
}
