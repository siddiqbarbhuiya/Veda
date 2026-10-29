import { Card, SectionLabel } from "@/components/ui/card";

const STEPS = [
  "Each AI request holds a small amount from your balance.",
  "You pay the real cost, never more than the hold.",
  "The unused part returns to your balance.",
];

export default function BillingCard() {
  return (
    <Card className="p-6">
      <SectionLabel>How billing works</SectionLabel>
      <ol className="mt-4 space-y-3">
        {STEPS.map((text, i) => (
          <li key={text} className="flex gap-3 text-sm text-fg-2">
            <span className="tnum flex size-5 shrink-0 items-center justify-center rounded-full bg-accent-subtle text-caption font-semibold text-accent-text">
              {i + 1}
            </span>
            {text}
          </li>
        ))}
      </ol>
    </Card>
  );
}
