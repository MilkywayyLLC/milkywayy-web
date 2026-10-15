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
import { HERO_TEMPLATES } from "@/lib/placements";
import { withPlayback } from "@/lib/playable";
import { HeroTitle } from "@/components/type/HeroTitle";
import { ButtonLink } from "@/components/ui/Button";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { Hl, SectionHead } from "@/components/ui/Section";
import { placedShowcase, SHOWCASE } from "@/lib/showcase";
import {
  getBeforeAfter,
  getFaqs,
  getPinnedPair,
  getHeroTemplate,
  getPlaced,
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
  const [faqs, hero, photos, videos, tours, pricing, pairs, template] = await Promise.all([
    getFaqs("property-shoots"),
    getPortfolio("property-hero-media"),
    getPortfolio("property-gallery-photo"),
    getPortfolio("property-gallery-video"),
    getPortfolio("property-gallery-360"),
    getPropertyPricing(),
    getBeforeAfter(),
    getHeroTemplate("Property shoots"),
  ]);
  // Hero: a before/after slider with the first published Before/after pair (13 Oct 2026).
  // Placements → Hero slots can pin one (lib/placements).
  const [pinnedPair, showcase] = await Promise.all([getPinnedPair(), getPlaced("showcase-photos")]);
  const pair = template === "ba" ? (pinnedPair ?? pairs.find((p) => p.published)) : undefined;
  const mediaTemplate = template === "ba" ? "photo" : template;
  const whatsapp = pageWhatsappLink("Property shoots", site.whatsapp.number);
  const [heroItems, samples] = await Promise.all([
    withPlayback(hero.slice(0, HERO_TEMPLATES[mediaTemplate].slots)),
    // Up to nine photos, so the grid ends on a full row.
    withPlayback([...photos.slice(0, 9), ...videos, ...tours]),
  ]);
  const d = pricing.delivery;
  const services: Included[] = [
    {
      kicker: `Delivered in ${d.photo}`,
      title: "HDR photography",
      text: "Bracketed, blended and colour-true, with straight verticals. Twilight edits from your daylight shots.",
    },
    {
      kicker: `Delivered in ${d.long}`,
      title: "Walkthrough video",
      text: "A smooth horizontal 16:9 tour of the whole home, made for the portals and YouTube.",
    },
    {
      kicker: `Delivered in ${d.short}`,
      title: "Social reels",
      text: "Vertical 9:16 walkthroughs and agent-presented videos, ready for Instagram and TikTok.",
    },
    {
      kicker: `Delivered in ${d.tour}`,
      title: "360° tours",
      text: "A virtual tour buyers can walk through from anywhere, with a link you can share anywhere.",
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
        <section className="p-hero" data-hero={template} aria-labelledby="property-title">
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
            <HeroMedia
              items={template === "ba" ? [] : heroItems}
              trioSizes="(max-width: 900px) 33vw, 15vw"
              template={mediaTemplate}
              label={template === "ba" ? "Before / after" : undefined}
            />
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
            variant="window"
          />
        </div>
      </section>

      <section className="sec alt" aria-labelledby="how-title">
        <div className="w">
          <SectionHead id="how-title" eyebrow="How it works" title="Booked to shared." />
          <Steps steps={STEPS} snap />
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
            photos={placedShowcase(showcase, photos)}
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
