import { ChevronDown } from "lucide-react";
import { Section, SectionHeading } from "./section";

const faqs = [
  {
    q: "Is my key safe?",
    a: "We encrypt your key with AES-256-GCM on the server before we store it. We never show it again after you save it. You can delete it at any time.",
  },
  {
    q: "Which providers work?",
    a: "OpenAI, Anthropic and Google Gemini. Add the key for the provider that you already use.",
  },
  {
    q: "What happens when my balance ends?",
    a: "The in-app AI stops until you top up. Your editor, files and code runners keep working.",
  },
  {
    q: "What if an AI call costs less than expected?",
    a: "Before each call, Veda holds an estimate from your balance. When the call ends, it settles at the real cost and the unused part goes straight back to your balance. The settled cost never goes above the hold.",
  },
  {
    q: "Which languages and runtimes?",
    a: "Node.js and JavaScript run through WebContainers. Python runs through Pyodide. Both run in your browser, so nothing runs on our servers.",
  },
  {
    q: "Does it work on my phone?",
    a: "You can open the site on a phone, but the IDE works best on a laptop. A larger screen gives you room for the editor, the terminal and the chat.",
  },
];

export function Faq() {
  return (
    <Section id="faq" labelledBy="faq-title">
      <SectionHeading id="faq-title" overline="FAQ" title="Questions students ask" />
      <div className="mx-auto mt-12 max-w-3xl divide-y divide-line overflow-hidden rounded-2xl border border-line-strong bg-panel">
        {faqs.map((f) => (
          <details key={f.q} className="group">
            <summary className="flex min-h-14 list-none items-center justify-between gap-4 px-5 py-4 font-medium transition-colors hover:bg-elevated [&::-webkit-details-marker]:hidden">
              {f.q}
              <ChevronDown
                size={20}
                aria-hidden="true"
                className="shrink-0 text-fg-3 transition-transform duration-200 group-open:rotate-180"
              />
            </summary>
            <p className="px-5 pb-5 text-fg-2">{f.a}</p>
          </details>
        ))}
      </div>
    </Section>
  );
}
