import Link from "next/link";
import { ArrowRight, IndianRupee, KeyRound, Laptop } from "lucide-react";
import { buttonStyles } from "@/components/ui/button";
import { IdeMockup } from "./ide-mockup";

const trust = [
  { icon: KeyRound, label: "Bring your own key" },
  { icon: IndianRupee, label: "Pay per AI call, in rupees" },
  { icon: Laptop, label: "Runs in your browser" },
];

export function Hero() {
  return (
    <section aria-labelledby="hero-title" className="overflow-hidden pb-16 pt-14 md:pb-24 md:pt-24">
      <div className="mx-auto w-full max-w-6xl px-4 md:px-6">
        <div className="mx-auto max-w-3xl text-center">
          <h1
            id="hero-title"
            className="font-display text-[clamp(40px,6vw,68px)] font-bold leading-[1.05] tracking-[-0.03em]"
          >
            Code with AI. Pay in rupees.
          </h1>
          <p className="mx-auto mt-6 max-w-xl text-lg text-fg-2">
            A browser IDE for your assignments, DSA practice and mini-projects. Your own AI key pays the AI
            provider. Veda credit, from ₹29 with UPI, pays for each in-app AI call.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row sm:gap-5">
            <Link href="/login" className={buttonStyles({ variant: "primary", size: "lg" })}>
              Start coding free
              <ArrowRight size={18} aria-hidden="true" />
            </Link>
            <Link
              href="/#how-it-works"
              className="inline-flex h-11 items-center rounded-md px-2 font-medium text-accent-text hover:underline"
            >
              See how it works
            </Link>
          </div>
          <ul className="mt-10 flex flex-col items-center justify-center gap-x-8 gap-y-3 text-ui text-fg-2 sm:flex-row sm:flex-wrap">
            {trust.map(({ icon: Icon, label }) => (
              <li key={label} className="flex items-center gap-2">
                <Icon size={16} className="text-accent-text" aria-hidden="true" />
                {label}
              </li>
            ))}
          </ul>
        </div>
        <IdeMockup />
      </div>
    </section>
  );
}

export function Providers() {
  return (
    <section aria-label="Supported AI providers" className="border-y border-line bg-panel py-10">
      <div className="mx-auto flex w-full max-w-6xl flex-col items-center gap-5 px-4 md:px-6">
        <p className="text-ui text-fg-3">Works with the AI keys you already have</p>
        <ul className="flex flex-wrap justify-center gap-x-10 gap-y-3">
          {["OpenAI", "Anthropic", "Google Gemini"].map((p) => (
            <li key={p} className="font-display text-lg font-semibold text-fg-2">
              {p}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
