import { Ctas } from "@/components/ui/Ctas";
import type { Metadata } from "next";
import { CTABand } from "@/components/blocks/CTABand";
import { DashboardShowcase } from "@/components/blocks/DashboardShowcase";
import { FAQ } from "@/components/blocks/FAQ";
import { FormatGallery } from "@/components/blocks/FormatGallery";
import { HeroMedia } from "@/components/blocks/HeroMedia";
import { BeforeAfter } from "@/components/media/BeforeAfter";
import { IncludedGrid, type Included } from "@/components/blocks/IncludedGrid";
import { Steps, type Step } from "@/components/blocks/Steps";
import { oneFormat } from "@/lib/media";
import { withPlayback } from "@/lib/playable";
import { HeroTitle } from "@/components/type/HeroTitle";
import { ButtonLink } from "@/components/ui/Button";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { Hl, SectionHead } from "@/components/ui/Section";
import { SHOWCASE, showcasePhotos } from "@/lib/showcase";
import {
  getBeforeAfter,
  getFaqs,
  getPortfolio,
  getPropertyPricing,
  getSiteSettings,
} from "@/lib/data";
import { formatNumber } from "@/lib/format";
import { lowestShootPrice } from "@/lib/pricing";
import { pageWhatsappLink } from "@/lib/whatsapp";
import { pageMetadata } from "@/lib/seo/meta";
import { PageLd } from "@/components/seo/JsonLd";

/** Booking lives in the portal: signed-out visitors sign in by email and land in the booking. */
const BOOK = "/portal?new=shoot";

export async function generateMetadata(): Promise<Metadata> {
  return pageMetadata("property-shoots");
}

const STEPS: Step[] = [
  {
    n: "01",
    title: "Book online",
    text: "In your dashboard: pick the services, a date and the exact entrance. Priced as you go.",
  },
  {
    n: "02",
    title: "We shoot",
    text: "We confirm the slot and turn up on time, anywhere in Dubai.",
  },
  {
    n: "03",
    title: "Fast delivery",
    text: "Photos in 24 hours, videos in 48–72, in your dashboard with Download all.",
  },
  {
    n: "04",
    title: "Share a listing",
    text: "Turn the shoot into a listing page and send buyers one link.",
  },
];

/**
 * Property shoots (restructured 12 Oct 2026, like Production): hero with three reels → services →
 * portfolio → how it works → the portal booking, step by step → FAQ → CTA. Booking happens in the
 * client portal; old website booking links redirect here (next.config).
 */
export default async function PropertyShootsPage() {
  const site = await getSiteSettings();
  const [faqs, hero, photos, videos, tours, pricing, pairs] = await Promise.all([
    getFaqs("property-shoots"),
    getPortfolio("property-hero"),
    getPortfolio("property-gallery-photo"),
    getPortfolio("property-gallery-video"),
    getPortfolio("property-gallery-360"),
    getPropertyPricing(),
    getBeforeAfter(),
  ]);
  // Hero: a before/after slider with the first published Before/after pair (13 Oct 2026).
  const pair = pairs.find((p) => p.published);
  const whatsapp = pageWhatsappLink("Property shoots", site.whatsapp.number);
  const [heroItems, samples] = await Promise.all([
    withPlayback(oneFormat(hero).items),
    withPlayback([...photos, ...videos, ...tours]),
  ]);
  const d = pricing.delivery;
  const services: Included[] = [
    {
      kicker: `Delivered in ${d.photo}`,
      title: "HDR photography",
      text: "Bracketed and blended, true colours, straight verticals, bright windows. Need twilight shots? We create them from your daylight photos. Add it as an option when you book.",
    },
    {
      kicker: `Delivered in ${d.long}`,
      title: "Walkthrough video",
      text: "A horizontal 16:9 tour for the portals and YouTube.",
    },
    {
      kicker: `Delivered in ${d.short}`,
      title: "Social reels",
      text: "Vertical 9:16 walkthroughs and agent-presented videos.",
    },
    {
      kicker: `Delivered in ${d.tour}`,
      title: "360° tours",
      text: "A virtual tour buyers can walk through from anywhere.",
    },
  ];
  const actions = (
    <>
      <ButtonLink href={BOOK}>Book a shoot</ButtonLink>
      <ButtonLink href={whatsapp} variant="ghost">
        Ask on WhatsApp
      </ButtonLink>
    </>
  );

  return (
    <>
      <PageLd page="property-shoots" />
      <div className="w">
        <section className="p-hero" aria-labelledby="property-title">
          <div className="stack">
            <Eyebrow rec>Production · Property shoots</Eyebrow>
            <HeroTitle id="property-title" line1="Don't just list." line2={<Hl>Dominate.</Hl>} />
            <p className="lede">
              A real estate photographer in Dubai for photos, video and 360 tours. Photos back in 24
              hours.
            </p>
            <Ctas>{actions}</Ctas>
            <div className="anchor">
              <span>
                Photos from <b>AED {formatNumber(lowestShootPrice(pricing))}</b>
              </span>
              <span>
                Delivered in <b>{d.photo}</b>
              </span>
              <span>
                <b>Dubai-wide</b>
              </span>
            </div>
          </div>
          {pair ? (
            <BeforeAfter pair={pair} className="p-hero-ba" />
          ) : (
            <HeroMedia items={heroItems} trioSizes="(max-width: 900px) 33vw, 15vw" />
          )}
        </section>
      </div>

      <section className="sec alt" aria-labelledby="services-title">
        <div className="w">
          <SectionHead
            id="services-title"
            eyebrow="Services"
            title="Everything a listing needs."
            aside={
              <p className="lede">Pick one or all of them when you book. Prices show as you go.</p>
            }
          />
          <IncludedGrid items={services} cols={2} />
        </div>
      </section>

      <section className="sec" aria-labelledby="samples-title">
        <div className="w">
          <SectionHead id="samples-title" eyebrow="Portfolio" title="What you'll get." />
          <FormatGallery
            items={samples}
            tabs={["photo", "reel", "long-form", "360"]}
            label="Sample type"
            captions={false}
          />
        </div>
      </section>

      <section className="sec alt" aria-labelledby="how-title">
        <div className="w">
          <SectionHead id="how-title" eyebrow="How it works" title="Booked to shared." />
          <Steps steps={STEPS} />
        </div>
      </section>

      <section className="sec" aria-labelledby="dashboard-title">
        <div className="w">
          <SectionHead
            id="dashboard-title"
            eyebrow="Booking, step by step"
            title="Book it in your dashboard."
            aside={
              <p className="lede">
                Sign in with your email, pick the services, the date and the spot. We confirm, shoot
                and deliver to the same place.
              </p>
            }
          />
          <DashboardShowcase
            features={SHOWCASE.property}
            pricing={pricing}
            photos={showcasePhotos(photos)}
          />
        </div>
      </section>

      <section className="sec alt" aria-label="Questions">
        <div className="w">
          <FAQ title="Shoot-day FAQ." faqs={faqs} />
        </div>
      </section>

      <CTABand title="Your next listing, shot this week." actions={actions} />
    </>
  );
}
