import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage, Ph } from "@/components/marketing/legal-page";

export const metadata: Metadata = {
  title: "Refund and Cancellation Policy",
  description: "How Veda credit, AI call holds and refunds work.",
  alternates: { canonical: "/refund" },
  openGraph: { url: "/refund" },
};

export default function RefundPage() {
  return (
    <LegalPage
      title="Refund and Cancellation Policy"
      intro={
        <p>
          Veda has no subscription. You buy credit in small top-ups and use it for in-app AI calls. This page says
          what we return automatically and what you can ask us for. It is a draft and needs review by a lawyer
          before it is final.
        </p>
      }
      sections={[
        {
          id: "automatic",
          title: "What we return automatically",
          body: (
            <ul>
              <li>Before each AI call, we hold an estimated amount from your balance.</li>
              <li>When the call ends, we charge the real cost. The charge never goes above the hold.</li>
              <li>We return the unused part of the hold to your balance at once.</li>
              <li>If a call fails before the provider reports usage, we return the full hold.</li>
            </ul>
          ),
        },
        {
          id: "unused",
          title: "Unused top-up balance",
          body: (
            <p>
              Policy for unused top-up balance: <Ph>REFUND POLICY FOR UNUSED TOP-UP BALANCE</Ph>. Request window:{" "}
              <Ph>REFUND WINDOW</Ph>. Treatment of bonus credit: <Ph>BONUS CREDIT TREATMENT</Ph>.
            </p>
          ),
        },
        {
          id: "provider",
          title: "AI provider charges",
          body: (
            <p>
              Your own API key pays the AI provider directly. Veda cannot refund those charges. Ask the provider
              about them.
            </p>
          ),
        },
        {
          id: "failed",
          title: "Failed or duplicate payments",
          body: (
            <p>
              If Razorpay takes money and your balance does not rise, write to us with your payment ID. We check
              the payment and then add the credit or ask Razorpay to return the money. A refund goes back to the
              original payment method. The time that your bank needs is outside our control.
            </p>
          ),
        },
        {
          id: "how",
          title: "How to ask",
          body: (
            <p>
              Write to <Ph>CONTACT EMAIL</Ph> from the email address of your account. Add your payment ID and the
              reason. We reply within <Ph>SUPPORT RESPONSE TIME</Ph>. See <Link href="/contact">Contact</Link>.
            </p>
          ),
        },
        {
          id: "cancel",
          title: "Cancellation",
          body: (
            <p>
              There is nothing to cancel, because there is no subscription. You can stop using Veda at any time. To
              close your account, write to <Ph>CONTACT EMAIL</Ph>.
            </p>
          ),
        },
      ]}
    />
  );
}
