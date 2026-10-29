import type { ReactNode } from "react";
import { Nav, SkipLink } from "@/components/marketing/nav";
import { Footer } from "@/components/marketing/footer";

export default function LegalLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <SkipLink />
      <Nav />
      <main id="main" tabIndex={-1} className="flex-1 focus:outline-none">
        {children}
      </main>
      <Footer />
    </>
  );
}
