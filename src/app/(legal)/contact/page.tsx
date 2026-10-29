import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage, Ph } from "@/components/marketing/legal-page";

export const metadata: Metadata = {
  title: "Contact",
  description: "How to reach Veda for support, payment questions and privacy requests.",
  alternates: { canonical: "/contact" },
  openGraph: { url: "/contact" },
};

export default function ContactPage() {
  return (
    <LegalPage
      title="Contact"
      intro={<p>Write to us for support, payment problems or privacy requests.</p>}
      sections={[
        {
          id: "support",
          title: "Support",
          body: (
            <>
              <p>
                Email: <Ph>CONTACT EMAIL</Ph>. We reply within <Ph>SUPPORT RESPONSE TIME</Ph>.
              </p>
              <p>
                For a payment problem, write from the email address of your account and add the Razorpay payment
                ID. For a bug, say which browser you use (Chrome or Edge works best) and what you did.
              </p>
            </>
          ),
        },
        {
          id: "business",
          title: "Business details",
          body: (
            <ul>
              <li>
                Legal name: <Ph>LEGAL ENTITY NAME</Ph>
              </li>
              <li>
                Registered address: <Ph>REGISTERED ADDRESS</Ph>
              </li>
              <li>
                GSTIN: <Ph>GSTIN if applicable</Ph>
              </li>
              <li>
                Grievance officer: <Ph>GRIEVANCE OFFICER NAME</Ph>
              </li>
            </ul>
          ),
        },
        {
          id: "policies",
          title: "Related pages",
          body: (
            <ul>
              <li>
                <Link href="/terms">Terms of Service</Link>
              </li>
              <li>
                <Link href="/privacy">Privacy Policy</Link>
              </li>
              <li>
                <Link href="/refund">Refund and Cancellation Policy</Link>
              </li>
            </ul>
          ),
        },
      ]}
    />
  );
}
