"use client";

import Link from "next/link";
import { Check } from "lucide-react";
import { buttonStyles } from "@/components/ui/button";
import { TOPUP_PACKS, formatRupees } from "@/components/payments/topup-packs";
import { Section, SectionHeading } from "./section";

const blurb: Record<string, string> = {
  Starter: "Enough to try the in-app AI on a few assignments.",
  Standard: "A good fit for a week of DSA practice and project work.",
  Value: "The most credit for the money, with a ₹10 bonus.",
};

export function Pricing() {
  return (
    <Section id="pricing" labelledBy="pricing-title">
      <SectionHeading
        id="pricing-title"
        overline="Pricing"
        title="Small top-ups. No subscription."
        lead="Credit is for the in-app AI calls. Veda bills only what each call costs. Your AI provider bills your own key under its own terms."
      />
      <ul className="mt-12 grid items-stretch gap-4 md:grid-cols-3">
        {TOPUP_PACKS.map((pack) => {
          const featured = pack.name === "Standard";
          return (
            <li
              key={pack.name}
              className={`relative flex flex-col rounded-2xl border bg-panel p-6 ${
                featured ? "border-accent shadow-glow" : "border-line-strong"
              }`}
            >
              {featured ? (
                <span className="absolute -top-3 left-6 rounded-full bg-accent px-3 py-0.5 text-caption font-medium text-accent-fg">
                  Most students pick this
                </span>
              ) : null}
              <h3 className="text-xl font-semibold">{pack.name}</h3>
              <p className="tnum mt-4 font-display text-5xl font-bold tracking-[-0.03em]">
                {formatRupees(pack.amountPaise)}
              </p>
              <p className="mt-2 flex items-center gap-2 text-sm text-fg-2">
                <Check size={16} className="text-success" aria-hidden="true" />
                <span className="tnum">{formatRupees(pack.creditPaise)} credit</span>
                {pack.bonusPaise > 0 ? (
                  <span className="tnum text-success">incl. {formatRupees(pack.bonusPaise)} bonus</span>
                ) : null}
              </p>
              <p className="mt-3 text-fg-2">{blurb[pack.name]}</p>
              <Link
                href="/login"
                className={buttonStyles({
                  variant: featured ? "primary" : "secondary",
                  size: "lg",
                  className: "mt-8 w-full",
                })}
              >
                Get started with {formatRupees(pack.amountPaise)}
              </Link>
            </li>
          );
        })}
      </ul>
      <p className="mx-auto mt-8 max-w-2xl text-center text-ui text-fg-3 md:text-sm">
        How billing works: we hold an estimate before each AI call, settle at the real cost, and return
        the unused hold. Amounts are exact to the paise.
      </p>
    </Section>
  );
}
