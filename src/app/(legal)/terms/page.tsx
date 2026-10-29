import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage, Ph } from "@/components/marketing/legal-page";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "The terms for using Veda, the browser-based AI coding playground for Indian students.",
  alternates: { canonical: "/terms" },
  openGraph: { url: "/terms" },
};

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of Service"
      intro={
        <>
          <p>
            These terms apply when you use Veda, a browser-based coding workspace with an in-app AI assistant.
            Veda is run by <Ph>LEGAL ENTITY NAME</Ph>, <Ph>REGISTERED ADDRESS</Ph> (&quot;we&quot;, &quot;us&quot;).
            If you do not agree with these terms, do not use Veda.
          </p>
          <p>
            This page is a plain-language summary of how the service works. It is a draft and needs review by a
            lawyer before it is final.
          </p>
        </>
      }
      sections={[
        {
          id: "service",
          title: "What Veda is",
          body: (
            <p>
              Veda lets you write and run Node.js and Python code in your browser and ask an AI model about your
              code. Your code runs in your browser. The AI features need an API key from an AI provider (OpenAI,
              Anthropic or Google Gemini) and Veda credit.
            </p>
          ),
        },
        {
          id: "account",
          title: "Your account",
          body: (
            <>
              <p>
                You sign in with a Google or GitHub account. You are responsible for that account and for what
                happens under your Veda session. Give us correct information and tell us if you think someone else
                uses your account.
              </p>
              <p>
                You must be old enough to enter a binding contract where you live. If you are a minor, a parent or
                guardian must agree to these terms for you.
              </p>
            </>
          ),
        },
        {
          id: "keys",
          title: "Your AI provider keys",
          body: (
            <>
              <p>
                You bring your own API key from each AI provider. The provider charges you directly for each call,
                under the provider&apos;s own terms and prices. Veda does not control those prices and is not a
                party to your agreement with the provider.
              </p>
              <p>
                We encrypt your key with AES-256-GCM before we store it. Our server decrypts it for each AI call
                and sends it only to the provider that you chose. You can delete a saved key at any time. You must
                have the right to use any key that you add.
              </p>
            </>
          ),
        },
        {
          id: "credit",
          title: "Veda credit and payments",
          body: (
            <>
              <p>
                Veda credit pays Veda for each in-app AI call. You buy credit with a top-up. Payments go through
                Razorpay. We do not see or store your card, UPI or bank details.
              </p>
              <ul>
                <li>We keep your balance in paise (100 paise = ₹1).</li>
                <li>Before an AI call, we hold an estimated amount from your balance.</li>
                <li>
                  When the call ends, we charge the real cost. The charge never goes above the hold. We return the
                  unused part of the hold to your balance.
                </li>
                <li>If the call fails before the provider reports usage, we return the full hold.</li>
                <li>If your balance is too low to cover the hold, the AI call does not start.</li>
              </ul>
              <p>
                Prices of top-up packs are shown in rupees in the <Link href="/#pricing">pricing section</Link>.
                Taxes: <Ph>GSTIN if applicable</Ph>. Refunds are described on the{" "}
                <Link href="/refund">Refund Policy</Link> page.
              </p>
            </>
          ),
        },
        {
          id: "use",
          title: "Acceptable use",
          body: (
            <>
              <p>Do not use Veda to:</p>
              <ul>
                <li>break the law or the rights of other people;</li>
                <li>attack, overload or probe Veda or other systems;</li>
                <li>use an API key that is not yours, or share your account;</li>
                <li>try to avoid billing, rate limits or other safety checks;</li>
                <li>send content that the AI provider&apos;s rules do not allow.</li>
              </ul>
              <p>
                We may pause AI requests that come too fast, and we may suspend an account that breaks these rules.
              </p>
            </>
          ),
        },
        {
          id: "content",
          title: "Your code and projects",
          body: (
            <p>
              You own your code and your files. Veda keeps project files in your browser. If you turn on cloud
              sync, we also store each synced project in our database (up to 5 MB per project) so that you can open
              it on another device. You give us only the permission that we need to store your files and show them
              to you. When you ask the AI about a file, the content that you send goes to your AI provider.
            </p>
          ),
        },
        {
          id: "availability",
          title: "Availability and changes",
          body: (
            <p>
              We try to keep Veda available, but we do not promise that it will run without interruption or
              errors. AI answers can be wrong. Check them before you rely on them, in particular for graded work.
              We may change or stop a feature, and we may change these terms. When we change them, we update the
              date at the top of this page.
            </p>
          ),
        },
        {
          id: "liability",
          title: "Liability",
          body: (
            <p>
              Veda is provided &quot;as is&quot;. To the extent that the law allows, we are not liable for indirect
              loss, for AI provider charges, or for loss that comes from your use of AI output. Nothing here limits
              a right that the law does not allow us to limit. <Ph>LIABILITY CAP, if any</Ph>
            </p>
          ),
        },
        {
          id: "law",
          title: "Governing law",
          body: (
            <p>
              These terms follow the laws of India. Courts in <Ph>GOVERNING LAW CITY</Ph> have jurisdiction, unless
              a consumer-protection law gives you the right to go to another court.
            </p>
          ),
        },
        {
          id: "contact",
          title: "Contact",
          body: (
            <p>
              Questions about these terms: see the <Link href="/contact">Contact</Link> page or write to{" "}
              <Ph>CONTACT EMAIL</Ph>.
            </p>
          ),
        },
      ]}
    />
  );
}
