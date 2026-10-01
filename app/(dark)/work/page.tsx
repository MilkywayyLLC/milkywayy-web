import type { Metadata } from "next";
import { CaseStudyCards } from "@/components/blocks/CaseStudyCards";
import { CTABand } from "@/components/blocks/CTABand";
import { WorkGrid } from "@/components/blocks/WorkGrid";
import { HeroTitle } from "@/components/type/HeroTitle";
import { ButtonLink } from "@/components/ui/Button";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { SampleLabel } from "@/components/ui/SampleLabel";
import { Hl, SectionHead } from "@/components/ui/Section";
import { getCaseStudies, getPortfolio } from "@/lib/data";
import { pageWhatsappLink } from "@/lib/whatsapp";
import { pageMetadata } from "@/lib/seo/meta";
import { PageLd } from "@/components/seo/JsonLd";

export async function generateMetadata(): Promise<Metadata> {
  return pageMetadata("work");
}

/** Work (guide §6.7): title + filters → grid from the portfolio → case study cards. */
export default async function WorkPage() {
  const [items, cases] = await Promise.all([getPortfolio("work"), getCaseStudies()]);
  const hasSamples = items.some((i) => i.sample);

  return (
    <>
      <PageLd page="work" />
      <div className="w">
        <section className="p-hero p-hero-short" aria-labelledby="work-title">
          <div className="stack">
            <Eyebrow rec>Work</Eyebrow>
            <HeroTitle id="work-title" line1="Selected" line2={<Hl>work.</Hl>} />
          </div>
          <p className="lede">
            Property shoots, brand reels, long-form walkthroughs, photo edits and AI presenters.
            Filter by what you need.
          </p>
        </section>
      </div>

      <section className="sec alt" aria-label="Portfolio">
        <div className="w">
          {hasSamples && (
            <SampleLabel className="mb-4">Placeholder work · real projects go here</SampleLabel>
          )}
          <WorkGrid items={items} />
        </div>
      </section>

      {cases.length > 0 && (
        <section className="sec" aria-labelledby="cases-title">
          <div className="w">
            <SectionHead id="cases-title" eyebrow="Case studies" title="How the work gets made." />
            <CaseStudyCards items={cases} />
          </div>
        </section>
      )}

      <CTABand
        title="Tell us what you're working on."
        text="We reply within 15 minutes during working hours."
        actions={
          <>
            <ButtonLink href="/contact">Get a quote</ButtonLink>
            <ButtonLink href={pageWhatsappLink("Work")} variant="ghost">
              WhatsApp us
            </ButtonLink>
          </>
        }
      />
    </>
  );
}
