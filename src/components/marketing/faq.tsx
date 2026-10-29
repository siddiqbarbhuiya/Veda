import { ChevronDown } from "lucide-react";
import { Section, SectionHeading } from "./section";

const faqs = [
  {
    q: "Is my key safe?",
    a: "We encrypt your key with AES-256-GCM before we store it, and we never show it again. Our server decrypts it for each AI call and sends it only to the provider that you chose. You can delete it at any time.",
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
    q: "What do I pay for, and what if a call costs less than expected?",
    a: "Your own key pays the AI provider. Veda credit pays Veda for each in-app AI call. Before each call, Veda holds an estimate from your balance. When the call ends, it settles at the real cost and the unused part goes straight back to your balance. The settled cost never goes above the hold.",
  },
  {
    q: "Which languages and runtimes?",
    a: "Node.js runs through WebContainers. Python runs through Pyodide. Your code runs in your browser. Chrome or Edge works best.",
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
            <summary className="flex min-h-14 list-none items-center justify-between gap-4 px-5 py-4 font-medium transition-colors hover:bg-elevated focus-visible:outline-offset-[-2px] [&::-webkit-details-marker]:hidden">
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
