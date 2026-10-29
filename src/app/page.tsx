import type { Metadata } from "next";
import { SITE_DESCRIPTION, SITE_URL } from "@/lib/site";
import { Nav, SkipLink } from "@/components/marketing/nav";
import { Hero, Providers } from "@/components/marketing/hero";
import { Features } from "@/components/marketing/features";
import { HowItWorks } from "@/components/marketing/how-it-works";
import { Pricing } from "@/components/marketing/pricing";
import { Faq } from "@/components/marketing/faq";
import { FinalCta, Footer } from "@/components/marketing/footer";
import { LaunchStrip } from "@/components/marketing/launch-strip";
import { LaunchBanner } from "@/components/marketing/launch-banner";

export const metadata: Metadata = {
  alternates: { canonical: "/" },
  openGraph: { url: "/" },
};

const JSON_LD = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "Veda",
  url: SITE_URL,
  description: SITE_DESCRIPTION,
  applicationCategory: "DeveloperApplication",
  operatingSystem: "Web browser (Chrome or Edge recommended)",
  inLanguage: "en-IN",
  offers: {
    "@type": "AggregateOffer",
    priceCurrency: "INR",
    lowPrice: "29",
    highPrice: "99",
    offerCount: 3,
  },
};

export default function Home() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD).replace(/</g, "\\u003c") }}
      />
      <SkipLink />
      <LaunchBanner />
      <Nav />
      <main id="main" tabIndex={-1} className="flex-1 focus:outline-none">
        <LaunchStrip />
        <Hero />
        <Providers />
        <Features />
        <HowItWorks />
        <Pricing />
        <Faq />
        <FinalCta />
      </main>
      <Footer />
    </>
  );
}
