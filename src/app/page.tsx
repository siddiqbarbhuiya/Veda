import { Nav, SkipLink } from "@/components/marketing/nav";
import { Hero, Providers } from "@/components/marketing/hero";
import { Features } from "@/components/marketing/features";
import { HowItWorks } from "@/components/marketing/how-it-works";
import { Pricing } from "@/components/marketing/pricing";
import { Faq } from "@/components/marketing/faq";
import { FinalCta, Footer } from "@/components/marketing/footer";

export default function Home() {
  return (
    <>
      <SkipLink />
      <Nav />
      <main id="main" className="flex-1">
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
