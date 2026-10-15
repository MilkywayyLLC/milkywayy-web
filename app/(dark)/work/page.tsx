import type { Metadata } from "next";
import { CaseStudyCards } from "@/components/blocks/CaseStudyCards";
import { CTABand } from "@/components/blocks/CTABand";
import { FormatGallery } from "@/components/blocks/FormatGallery";
import { ButtonLink } from "@/components/ui/Button";
import { SampleLabel } from "@/components/ui/SampleLabel";
import { SectionHead } from "@/components/ui/Section";
import { getCaseStudies, getPortfolio, getSiteSettings } from "@/lib/data";
import { withPlayback } from "@/lib/playable";
import { WORK_TABS } from "@/lib/gallery-tabs";
import { pageWhatsappLink } from "@/lib/whatsapp";
import { pageMetadata } from "@/lib/seo/meta";
import { PageLd } from "@/components/seo/JsonLd";

export async function generateMetadata(): Promise<Metadata> {
  return pageMetadata("work");
}

/** Work (guide §6.7): title + filters → grid from the portfolio → case study cards. */
export default async function WorkPage() {
  const site = await getSiteSettings();
  const [placed, cases] = await Promise.all([getPortfolio("work"), getCaseStudies()]);
  const items = await withPlayback(placed);
  const hasSamples = items.some((i) => i.sample);

  return (
    <>
      <PageLd page="work" />
      <section className="sec alt work-sec" aria-label="Portfolio">
        <div className="w">
          <h1 className="sr">Work</h1>
          {hasSamples && (
            <SampleLabel className="mb-4">Placeholder work · real projects go here</SampleLabel>
          )}
          <FormatGallery items={items} tabs={WORK_TABS} label="Work by format" />
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
            <ButtonLink href={pageWhatsappLink("Work", site.whatsapp.number)} variant="ghost">
              WhatsApp us
            </ButtonLink>
          </>
        }
      />
    </>
  );
}
