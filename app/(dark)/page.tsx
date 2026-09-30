import type { Metadata } from "next";
import { CTABand } from "@/components/blocks/CTABand";
import { FAQ } from "@/components/blocks/FAQ";
import { FounderBlock } from "@/components/blocks/FounderBlock";
import { NeedSelector, type Need } from "@/components/blocks/NeedSelector";
import { ProofStrip } from "@/components/blocks/ProofStrip";
import { ReelStrip } from "@/components/blocks/ReelStrip";
import { ServiceRow } from "@/components/blocks/ServiceRow";
import { StatsBand } from "@/components/blocks/StatsBand";
import { Steps, type Step } from "@/components/blocks/Steps";
import { Testimonials } from "@/components/blocks/Testimonials";
import { LiteVideo } from "@/components/media/LiteVideo";
import { Timecode } from "@/components/media/Timecode";
import { ViewfinderFrame } from "@/components/media/ViewfinderFrame";
import { HeroTitle } from "@/components/type/HeroTitle";
import { ButtonLink } from "@/components/ui/Button";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { SampleLabel } from "@/components/ui/SampleLabel";
import { Hl, SectionHead } from "@/components/ui/Section";
import {
  getClients,
  getFaqs,
  getOtherPricing,
  getPortfolio,
  getPropertyPricing,
  getReviews,
  getSiteSettings,
  getStats,
  showsProofStrip,
} from "@/lib/data";
import { formatNumber, formatUSD } from "@/lib/format";
import { pageWhatsappLink } from "@/lib/whatsapp";

export const metadata: Metadata = {
  title: { absolute: "Milkywayy | Content Production Studio in Dubai" },
  description:
    "Dubai content studio: property and brand shoots in the UAE, remote photo and video editing worldwide, and AI presenters. Property photos delivered in 24 hours.",
  alternates: { canonical: "/" },
};

const NEEDS: Need[] = [
  {
    key: "UAE",
    title: "Content shot and edited for me",
    sub: "Monthly packages or a single property shoot",
    href: "/production",
  },
  {
    key: "GLOBAL",
    title: "An editor for my own shoots",
    sub: "Photo, video and AI avatar editing",
    href: "/post-production",
  },
  {
    key: "ANYONE",
    title: "A presenter without filming",
    sub: "A custom AI avatar for your brand",
    href: "/ai-avatars",
  },
];

const STEPS: Step[] = [
  {
    n: "01",
    title: "Brief",
    text: "A 15-minute call or a WhatsApp chat. We agree scope, dates and price.",
  },
  {
    n: "02",
    title: "Shoot or generate",
    text: "On location in Dubai, from your raw files, or with your AI avatar.",
  },
  { n: "03", title: "Edit", text: "In-house editors. Photos in 24 hours, reels in 24–48." },
  {
    n: "04",
    title: "Deliver",
    text: "Files, invoices and revision requests in your client dashboard.",
  },
];

export default async function HomePage() {
  const [
    site,
    clients,
    proof,
    stats,
    faqs,
    reviews,
    reels,
    rowProd,
    rowPost,
    rowAv,
    property,
    other,
  ] = await Promise.all([
    getSiteSettings(),
    getClients(),
    showsProofStrip("home"),
    getStats("home"),
    getFaqs("home"),
    getReviews("home"),
    getPortfolio("home-reels"),
    getPortfolio("home-row-production"),
    getPortfolio("home-row-post"),
    getPortfolio("home-row-avatars"),
    getPropertyPricing(),
    getOtherPricing(),
  ]);

  const shootsFrom = Math.min(
    ...property.apartment.sizes.map((s) => s.photo),
    ...property.villa.sizes.map((s) => s.photo),
    ...property.commercial.tiers.map((t) => t.photo),
  );
  const photoRate = other.postProduction.rates.find((r) => r.key === "photo");
  const whatsapp = pageWhatsappLink("Home");
  const showreelIsSample = !site.showreel.video;

  return (
    <>
      <div className="w">
        <section className="hero" aria-labelledby="home-title">
          <div className="hero-copy">
            <Eyebrow rec>Dubai content studio · Clients worldwide</Eyebrow>
            <HeroTitle
              id="home-title"
              line1={
                <>
                  Content that <Hl>sells</Hl>
                </>
              }
              line2="property & brands."
            />
            <p className="lede">
              We shoot and edit in the UAE, edit remotely for studios abroad, and build AI
              presenters for people who&apos;d rather not be on camera.
            </p>
            <NeedSelector needs={NEEDS} />
          </div>
          <div className="stack" style={{ gap: 10 }}>
            <ViewfinderFrame
              media={site.showreel}
              className="hero-media"
              topLeft="4K · 25P"
              timecode={<Timecode start="00:14:08" />}
              tag="Showreel 2026"
              tagRight={site.showreel.duration}
              priority
              sizes="(max-width: 900px) 100vw, 45vw"
            >
              <LiteVideo video={site.showreel.video} title="Milkywayy showreel" />
            </ViewfinderFrame>
            {showreelIsSample && <SampleLabel>Placeholder · showreel coming</SampleLabel>}
          </div>
        </section>
      </div>

      {proof && <ProofStrip clients={clients} rating={site.googleRating.value} />}

      <section className="sec" id="services" aria-labelledby="services-title">
        <div className="w">
          <SectionHead
            id="services-title"
            eyebrow="What we do"
            title="Three services. One studio."
            aside={
              <p className="lede">
                Every service has its own page with real samples, the process and prices. Pick the
                one that fits.
              </p>
            }
          />
          <div className="doors">
            <ServiceRow
              kicker="01 · Production · UAE"
              title="Shoot and edit, handled end to end."
              text="Monthly content for agencies and brands: shoot days, reels and long-form. Or one property shoot, booked in a minute."
              price={
                <>
                  Packages from <b>AED {formatNumber(other.production.fromMonthly)} / month</b> ·
                  Shoots from <b>AED {formatNumber(shootsFrom)}</b>
                </>
              }
              cta="Explore production"
              href="/production"
              media={rowProd}
            />
            <ServiceRow
              kicker="02 · Post-production · Worldwide"
              title="Your remote edit team."
              text="Photo edits, short-form and long-form video, and AI avatar generation for media companies and creators, anywhere."
              price={
                <>
                  Edits from <b>{photoRate ? formatUSD(photoRate.amount) : ""} per photo</b> · Free
                  test edit
                </>
              }
              cta="Explore post-production"
              href="/post-production"
              media={rowPost}
            />
            <ServiceRow
              kicker="03 · AI avatars · Everyone"
              title="A presenter built for your brand."
              text="A custom AI host with its own face and voice, scripted and edited into videos every month. No camera, no studio."
              price={
                <>
                  <b>Launch pricing</b> · Book a demo
                </>
              }
              cta="Explore AI avatars"
              href="/ai-avatars"
              media={rowAv}
            />
          </div>
        </div>
      </section>

      {reels.length > 0 && (
        <section className="sec alt" id="work" aria-label="Selected work">
          <div className="w">
            <ReelStrip items={reels} eyebrow="Selected work" title="Made for the feed." />
          </div>
        </section>
      )}

      {stats.length > 0 && (
        <section className="sec tight" aria-label="Studio in numbers">
          <div className="w">
            <StatsBand stats={stats} />
          </div>
        </section>
      )}

      <section className="sec" style={{ paddingTop: 0 }} aria-labelledby="how-title">
        <div className="w">
          <SectionHead id="how-title" eyebrow="How we work" title="Brief to delivery." />
          <Steps steps={STEPS} />
        </div>
      </section>

      <section className="sec alt" id="founder" aria-label="From the founder">
        <div className="w">
          <FounderBlock founder={site.founder} />
        </div>
      </section>

      {reviews.length > 0 && (
        <section className="sec" aria-labelledby="reviews-title">
          <div className="w">
            <SectionHead id="reviews-title" eyebrow="Client words" title="What clients say." />
            <Testimonials reviews={reviews} />
          </div>
        </section>
      )}

      <section className="sec alt" aria-label="Questions">
        <div className="w">
          <FAQ
            title="Before you ask."
            lede="Anything else: WhatsApp us and a real person replies."
            faqs={faqs}
          />
        </div>
      </section>

      <CTABand
        title="Tell us what you're working on."
        text="We reply within 15 minutes during working hours."
        actions={
          <>
            <ButtonLink href="/contact">Get a quote</ButtonLink>
            <ButtonLink href={whatsapp} variant="ghost">
              WhatsApp us
            </ButtonLink>
          </>
        }
      />
    </>
  );
}
