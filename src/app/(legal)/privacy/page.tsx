import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage, Ph } from "@/components/marketing/legal-page";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "What data Veda collects, why we collect it and who we share it with.",
  alternates: { canonical: "/privacy" },
  openGraph: { url: "/privacy" },
};

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      intro={
        <>
          <p>
            This page explains what data Veda collects and how we use it. The data controller is{" "}
            <Ph>LEGAL ENTITY NAME</Ph>, <Ph>REGISTERED ADDRESS</Ph>.
          </p>
          <p>
            Veda shows no ads and does not sell your data. This page is a draft and needs review by a lawyer
            before it is final.
          </p>
        </>
      }
      sections={[
        {
          id: "collect",
          title: "What we collect",
          body: (
            <ul>
              <li>
                <strong>Account data.</strong> When you sign in with Google or GitHub, we receive your name and
                email address from that provider.
              </li>
              <li>
                <strong>API keys.</strong> The AI provider keys that you save. We store them encrypted. We never
                show them to you again.
              </li>
              <li>
                <strong>Wallet records.</strong> Your balance in paise and a list of transactions (top-ups,
                bonuses and AI usage). An AI usage record has the provider, the model, the token counts and the
                amount charged.
              </li>
              <li>
                <strong>Payment references.</strong> Razorpay gives us a payment ID and the status of a payment.
                We do not receive or store your card, UPI or bank details.
              </li>
              <li>
                <strong>Project files.</strong> Files that you sync to the cloud: file names and contents, up to 5
                MB per project.
              </li>
              <li>
                <strong>Short-lived request log.</strong> To limit abusive speed, we store the time of your recent
                AI requests. We delete these records automatically after about 2 minutes.
              </li>
            </ul>
          ),
        },
        {
          id: "browser",
          title: "What stays in your browser",
          body: (
            <p>
              Your project files are stored in your browser (IndexedDB) first. Your theme choice is stored in local
              storage. Your code runs in your browser, through WebContainers (Node.js) and Pyodide (Python). If you
              do not turn on cloud sync, your files stay on your device.
            </p>
          ),
        },
        {
          id: "use",
          title: "How we use data",
          body: (
            <ul>
              <li>To sign you in and keep your session.</li>
              <li>To make AI calls with your key, and to charge and refund your Veda credit.</li>
              <li>To process payments and show your transaction history.</li>
              <li>To store and sync your projects when you ask us to.</li>
              <li>To prevent abuse and keep the service safe.</li>
            </ul>
          ),
        },
        {
          id: "keys",
          title: "How we protect API keys",
          body: (
            <p>
              We encrypt each key with AES-256-GCM before we store it. Our server decrypts it only to make an AI
              call, and sends it only to the provider that you chose. No system can promise perfect security. If
              you think a key is exposed, delete it in your dashboard and make a new key with your provider.
            </p>
          ),
        },
        {
          id: "sharing",
          title: "Who we share data with",
          body: (
            <>
              <ul>
                <li>
                  <strong>Supabase</strong> hosts our database and sign-in.
                </li>
                <li>
                  <strong>Razorpay</strong> processes payments, under its own privacy policy.
                </li>
                <li>
                  <strong>Your AI provider</strong> (OpenAI, Anthropic or Google) receives the prompt and file
                  content that you send in the AI chat, together with your key. Its own terms and privacy policy
                  apply to that data.
                </li>
                <li>
                  <strong>Google and GitHub</strong> provide sign-in.
                </li>
                <li>
                  <strong>Our hosting provider</strong> serves the website and the API.
                </li>
              </ul>
              <p>We may also share data when the law requires it.</p>
            </>
          ),
        },
        {
          id: "retention",
          title: "How long we keep data",
          body: (
            <p>
              We keep account, wallet and project data while your account exists. We may keep transaction records
              longer where tax or accounting law requires it: <Ph>DATA RETENTION PERIOD</Ph>. You can delete saved
              keys yourself at any time.
            </p>
          ),
        },
        {
          id: "rights",
          title: "Your choices and rights",
          body: (
            <p>
              You can ask us to access, correct or delete your personal data, or to delete your account, by writing
              to <Ph>CONTACT EMAIL</Ph>. Grievance officer: <Ph>GRIEVANCE OFFICER NAME</Ph>, at the same address.
              We reply within <Ph>SUPPORT RESPONSE TIME</Ph>.
            </p>
          ),
        },
        {
          id: "children",
          title: "Children",
          body: <p>Veda is for students. If you are under 18, use it with the consent of a parent or guardian.</p>,
        },
        {
          id: "changes",
          title: "Changes and contact",
          body: (
            <p>
              If we change this policy, we update the date at the top. For questions, see{" "}
              <Link href="/contact">Contact</Link>.
            </p>
          ),
        },
      ]}
    />
  );
}
