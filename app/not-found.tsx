import { Ctas } from "@/components/ui/Ctas";
import type { Metadata } from "next";
import { SiteShell } from "@/components/layout/SiteShell";
import { HeroTitle } from "@/components/type/HeroTitle";
import { ButtonLink } from "@/components/ui/Button";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { Hl } from "@/components/ui/Section";

export const metadata: Metadata = { title: "Page not found" };

/** 404: dark, with the header and footer, and the three most useful ways back. */
export default function NotFound() {
  return (
    <SiteShell tone="dark">
      <div className="w">
        <section
          className="p-hero p-hero-short"
          aria-labelledby="nf-title"
          style={{ minHeight: "50vh" }}
        >
          <div className="stack">
            <Eyebrow rec>404 · Page not found</Eyebrow>
            <HeroTitle id="nf-title" line1="Out of" line2={<Hl>frame.</Hl>} />
            <p className="lede">This page moved or never existed. Try one of these instead.</p>
            <Ctas>
              <ButtonLink href="/">Home</ButtonLink>
              <ButtonLink href="/contact" variant="ghost">
                Contact
              </ButtonLink>
            </Ctas>
            <ButtonLink href="/property-shoots" variant="link">
              Book a property shoot →
            </ButtonLink>
          </div>
        </section>
      </div>
    </SiteShell>
  );
}
