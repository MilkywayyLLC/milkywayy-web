import type { Metadata } from "next";
import { CTABand } from "@/components/blocks/CTABand";
import { DashboardShowcase } from "@/components/blocks/DashboardShowcase";
import { FAQ } from "@/components/blocks/FAQ";
import { NeedSelector, type Need } from "@/components/blocks/NeedSelector";
import { ProofStrip } from "@/components/blocks/ProofStrip";
import { rowMedia, ServiceRow } from "@/components/blocks/ServiceRow";
import { StatsBand } from "@/components/blocks/StatsBand";
import { Steps, type Step } from "@/components/blocks/Steps";
import { Testimonials } from "@/components/blocks/Testimonials";
import { Ctas } from "@/components/ui/Ctas";
import { LiteVideo } from "@/components/media/LiteVideo";
import { RotatingWord } from "@/components/type/RotatingWord";
import { MediaFrame } from "@/components/media/MediaFrame";
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
  getPlaced,
  getReviews,
  getShowreel,
  getSiteSettings,
  getStats,
  showsProofStrip,
} from "@/lib/data";
import { formatNumber, formatUSD } from "@/lib/format";
import { lowestShootPrice } from "@/lib/pricing";
import { withPlayback } from "@/lib/playable";
import { pageWhatsappLink } from "@/lib/whatsapp";
import { pageMetadata } from "@/lib/seo/meta";
import { placedShowcase, SHOWCASE } from "@/lib/showcase";
import { PageLd } from "@/components/seo/JsonLd";

export async function generateMetadata(): Promise<Metadata> {
  return pageMetadata("home");
}

const NEEDS: Need[] = [
  {
    key: "UAE",
    title: "Content shot and edited",
    sub: "Photo and video for agencies and brands",
    href: "/production",
  },
  {
    key: "GLOBAL",
    title: "An editor for your shoots",
    sub: "Remote photo, video and AI avatar editing",
    href: "/post-production",
  },
  {
    key: "ANYONE",
    title: "An AI presenter",
    sub: "An AI host with its own face and voice",
    href: "/ai-avatars",
  },
];

/** Home keeps the FAQ short; the rest live on the service pages (site-refine, 3 Oct 2026). */
const HOME_FAQS = 6;

const STEPS: Step[] = [
  {
    n: "01",
    title: "Brief",
    text: "A 15-minute call or a WhatsApp chat. We agree scope, dates and price.",
  },
  {
    n: "02",
    title: "Produce",
    text: "On location in Dubai, from your raw files, or with your AI avatar.",
  },
  { n: "03", title: "Edit", text: "In-house editors. Photos within 24 hours, often same day; reels up to 48 hours." },
  {
    n: "04",
    title: "Deliver",
    text: "Files, invoices and revision requests in your client dashboard.",
  },
];

/** Home hero's rotating word, in order; the first is what the server renders. */
const HERO_WORDS = ["properties.", "products.", "services.", "experiences."];

export default async function HomePage() {
  const [
    site,
    clients,
    proof,
    stats,
    faqs,
    reviews,
    rowProd,
    rowPost,
    rowAv,
    property,
    other,
    portfolio,
  ] = await Promise.all([
    getSiteSettings(),
    getClients(),
    showsProofStrip("home"),
    getStats("home"),
    getFaqs("home"),
    getReviews("home"),
    getPortfolio("home-row-production"),
    getPortfolio("home-row-post"),
    getPortfolio("home-row-avatars"),
    getPropertyPricing(),
    getOtherPricing(),
    getPortfolio(),
  ]);
  const [showreel, showcase, rows] = await Promise.all([
    getShowreel(),
    getPlaced("showcase-photos"),
    withPlayback([rowProd[0], rowPost[0], rowAv[0]].filter((i) => i !== undefined)),
  ]);
  const rowOf = (id?: string) => rows.find((r) => r.id === id);

  const shootsFrom = lowestShootPrice(property);
  const photoRate = other.postProduction.rates.find((r) => r.key === "photo");
  const whatsapp = pageWhatsappLink("Home", site.whatsapp.number);
  const showreelIsSample = !showreel.video;

  return (
    <>
      <PageLd page="home" />
      <div className="home">
        <div className="hero-band">
          <div className="w">
            <section className="hero" aria-labelledby="home-title">
              <div className="hero-copy">
                <Eyebrow rec>Dubai content studio · Clients worldwide</Eyebrow>
                <HeroTitle
                  id="home-title"
                  label="Content that sells properties, products, services and experiences"
                  line1="Content that sells"
                  line2={
                    <Hl>
                      <RotatingWord words={HERO_WORDS}>experiences.</RotatingWord>
                    </Hl>
                  }
                />
                <p className="lede">
                  Photography and video for real estate and brands,
                  <br className="br-lg" /> shot in Dubai. Post-production and AI presenters
                  <br className="br-lg" /> for clients worldwide.
                </p>
                <Ctas>
                  <ButtonLink href="/portal?new=choose">Book media</ButtonLink>
                  <ButtonLink href="/work" variant="ghost">
                    See our work
                  </ButtonLink>
                </Ctas>
              </div>
              <div className="hero-media-col">
                <MediaFrame
                  media={showreel}
                  kind="showreel"
                  corners={false}
                  priority
                  sizes="(max-width: 900px) 100vw, 640px"
                >
                  <LiteVideo
                    video={showreel.video}
                    title="Milkywayy showreel"
                    poster={showreel.src}
                    ambient
                  />
                </MediaFrame>
                {showreelIsSample && <SampleLabel>Placeholder · showreel coming</SampleLabel>}
              </div>
            </section>
          </div>
        </div>

        {/* Trusted-by / Google rating right under the hero, as on Production. */}
        {proof && clients.length > 0 && (
          <ProofStrip clients={clients} rating={site.googleRating.value} />
        )}

        <section className="sec">
          <div className="w">
            <NeedSelector needs={NEEDS} />
          </div>
        </section>

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
                media={rowMedia(rowOf(rowProd[0]?.id))}
                placeholder="long-form"
              />
              <ServiceRow
                kicker="02 · Post-production · Worldwide"
                title="Your remote edit team."
                text="Photo edits, short-form and long-form video, and AI avatar generation for media companies and creators, anywhere."
                price={
                  <>
                    Edits from <b>{photoRate ? formatUSD(photoRate.amount) : ""} per photo</b> ·
                    Free test edit
                  </>
                }
                cta="Explore post-production"
                href="/post-production"
                media={rowMedia(rowOf(rowPost[0]?.id))}
                placeholder="photo"
                flip
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
                media={rowMedia(rowOf(rowAv[0]?.id))}
                placeholder="reel"
              />
            </div>
          </div>
        </section>

        {stats.length > 0 && (
          <section className="sec stats-sec" aria-label="Studio in numbers">
            <div className="w">
              <StatsBand stats={stats} />
            </div>
          </section>
        )}

        <section className="sec" aria-labelledby="dashboard-title">
          <div className="w">
            <SectionHead
              id="dashboard-title"
              eyebrow="Your client dashboard"
              title="Everything in one place."
              aside={
                <p className="lede head-under">
                  We know where production slows: follow-ups, revisions, back-and-forth. Our
                  dashboard removes them. You book, we shoot. We deliver, you collect.
                </p>
              }
            />
            <DashboardShowcase
              features={SHOWCASE.home}
              photos={placedShowcase(showcase, portfolio)}
            />
          </div>
        </section>

        <section className="sec" aria-labelledby="how-title">
          <div className="w">
            <SectionHead id="how-title" eyebrow="How we work" title="Brief to delivery." />
            <Steps steps={STEPS} />
          </div>
        </section>

        {reviews.length > 0 && (
          <section className="sec" aria-labelledby="reviews-title">
            <div className="w">
              <Testimonials
                reviews={reviews}
                google={site.googleRating}
                head={
                  <SectionHead
                    id="reviews-title"
                    eyebrow="Client words"
                    title="What clients say."
                  />
                }
              />
            </div>
          </section>
        )}

        <section className="sec" aria-label="Questions">
          <div className="w">
            <FAQ
              title="Before you ask."
              lede="Anything else: WhatsApp us and a real person replies."
              faqs={faqs.slice(0, HOME_FAQS)}
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
      </div>
    </>
  );
}
