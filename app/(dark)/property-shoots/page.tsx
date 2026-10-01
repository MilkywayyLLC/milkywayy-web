import { Ctas } from "@/components/ui/Ctas";
import type { Metadata } from "next";
import { BookingSection } from "@/components/booking/BookingSection";
import { CompareTable } from "@/components/blocks/CompareTable";
import { CTABand } from "@/components/blocks/CTABand";
import { DashboardPreview } from "@/components/blocks/DashboardPreview";
import { FAQ } from "@/components/blocks/FAQ";
import { SampleGallery } from "@/components/blocks/SampleGallery";
import { ViewfinderFrame } from "@/components/media/ViewfinderFrame";
import { HeroTitle } from "@/components/type/HeroTitle";
import { ButtonLink } from "@/components/ui/Button";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { Hl, SectionHead } from "@/components/ui/Section";
import { getFaqs, getPortfolio, getPropertyPricing, getSiteSettings } from "@/lib/data";
import { env } from "@/lib/env";
import { formatNumber } from "@/lib/format";
import { lowestShootPrice } from "@/lib/pricing";
import { pageWhatsappLink } from "@/lib/whatsapp";
import { pageMetadata } from "@/lib/seo/meta";
import { PageLd } from "@/components/seo/JsonLd";

// The booking calendar's first bookable day is computed on the server (Dubai time); refresh hourly.
export const revalidate = 3600;

export async function generateMetadata(): Promise<Metadata> {
  return pageMetadata("property-shoots");
}

/**
 * Property shoots, one page (owner, 1 Oct 2026): short hero → booking builder → samples →
 * dashboard → "No more chasing" → FAQ → CTA band. Replaces /production/property-shoots and /book.
 */
export default async function PropertyShootsPage() {
  const site = await getSiteSettings();
  const [faqs, hero, photos, videos, tours, pricing] = await Promise.all([
    getFaqs("property-shoots"),
    getPortfolio("property-hero"),
    getPortfolio("property-gallery-photo"),
    getPortfolio("property-gallery-video"),
    getPortfolio("property-gallery-360"),
    getPropertyPricing(),
  ]);
  const whatsapp = pageWhatsappLink("Property shoots", site.whatsapp.number);
  const heroItem = hero[0];

  return (
    <>
      <PageLd page="property-shoots" />
      <div className="w">
        <section className="p-hero p-hero-short" aria-labelledby="property-title">
          <div className="stack">
            <Eyebrow rec>Production · Property shoots</Eyebrow>
            <HeroTitle id="property-title" line1="Don't just list." line2={<Hl>Dominate.</Hl>} />
            <p className="lede">
              Photos, video and 360 tours for Dubai listings. See your price in a minute, photos
              back in 24 hours.
            </p>
            <Ctas>
              <ButtonLink href="#booking">Price my shoot</ButtonLink>
              <ButtonLink href={whatsapp} variant="ghost">
                WhatsApp us
              </ButtonLink>
            </Ctas>
            <div className="anchor">
              <span>
                Photos from <b>AED {formatNumber(lowestShootPrice(pricing))}</b>
              </span>
              <span>
                Delivered in <b>{pricing.delivery.photo}</b>
              </span>
              <span>
                <b>Dubai-wide</b>
              </span>
            </div>
          </div>
          {heroItem && (
            <ViewfinderFrame
              media={heroItem.media}
              aspect="16/10"
              topLeft="F/8 · ISO 100"
              tag={heroItem.tag}
              tagRight="Photo 07 / 32"
              priority
              sizes="(max-width: 900px) 100vw, 42vw"
            />
          )}
        </section>
      </div>

      <BookingSection />

      <section className="sec" aria-labelledby="samples-title">
        <div className="w">
          <SectionHead id="samples-title" eyebrow="Samples" title="What you'll get." />
          <SampleGallery items={{ photo: photos, video: videos, "360": tours }} />
        </div>
      </section>

      <section className="sec alt" aria-labelledby="dashboard-title">
        <div className="w dash">
          <div className="stack">
            <span className="eb">After you book</span>
            <h2 className="d h2" id="dashboard-title">
              Everything in one dashboard.
            </h2>
            <p className="lede">
              Track the shoot, download files and invoices, request a reshoot. Your files stay there
              permanently.
            </p>
            <Ctas>
              <ButtonLink href={env.clientLoginUrl} variant="ghost">
                Client login
              </ButtonLink>
            </Ctas>
          </div>
          <DashboardPreview
            rows={[
              {
                title: "Dubai Marina · 2BR",
                meta: "Photo + reel · Thu 2 Oct",
                status: "Editing",
                tone: "go",
              },
              {
                title: "JVC Townhouse",
                meta: "Photo + 360 · Mon 29 Sep",
                status: "Delivered",
                tone: "ok",
              },
              {
                title: "Business Bay office",
                meta: "Commercial Essential · Fri 26 Sep",
                status: "Delivered",
                tone: "ok",
              },
              { title: "Invoice MW-1042", meta: "AED 1,050 · Paid", status: "PDF" },
            ]}
          />
        </div>
      </section>

      <section className="sec" aria-labelledby="compare-title">
        <div className="w">
          <SectionHead id="compare-title" eyebrow="The difference" title="No more chasing." />
          <CompareTable
            bad={{
              title: "The usual way",
              items: [
                "Message three photographers for quotes",
                "Wait days for a price",
                "Chase files over WhatsApp",
                "Invoices by email, if you ask",
              ],
            }}
            good={{
              title: "With Milkywayy",
              items: [
                "See the price in a minute",
                "Pick a slot that suits you",
                "Photos in 24 hours, in your dashboard",
                "Invoices ready to download",
              ],
            }}
          />
        </div>
      </section>

      <section className="sec alt" aria-label="Questions">
        <div className="w">
          <FAQ title="Shoot-day FAQ." faqs={faqs} />
        </div>
      </section>

      <CTABand
        title="Your next listing, shot this week."
        actions={
          <>
            <ButtonLink href="#booking">Price my shoot</ButtonLink>
            <ButtonLink href={whatsapp} variant="ghost">
              WhatsApp us
            </ButtonLink>
          </>
        }
      />
    </>
  );
}
