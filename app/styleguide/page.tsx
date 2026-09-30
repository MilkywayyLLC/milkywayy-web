import type { Metadata } from "next";
import type { ReactNode } from "react";
import { BookingDemo } from "./BookingDemo";
import { AiTiers } from "@/components/blocks/AiTiers";
import { BeforeAfterGallery } from "@/components/blocks/BeforeAfterGallery";
import { CompareTable } from "@/components/blocks/CompareTable";
import { CTABand } from "@/components/blocks/CTABand";
import { DashboardPreview } from "@/components/blocks/DashboardPreview";
import { FAQ } from "@/components/blocks/FAQ";
import { FounderBlock } from "@/components/blocks/FounderBlock";
import { IncludedGrid } from "@/components/blocks/IncludedGrid";
import { NeedSelector } from "@/components/blocks/NeedSelector";
import { PackagesBand } from "@/components/blocks/PackagesBand";
import { PathCards } from "@/components/blocks/PathCards";
import { ProofStrip } from "@/components/blocks/ProofStrip";
import { RateCards } from "@/components/blocks/RateCards";
import { ReelStrip } from "@/components/blocks/ReelStrip";
import { SampleGallery } from "@/components/blocks/SampleGallery";
import { ServiceCards4 } from "@/components/blocks/ServiceCards4";
import { ServiceRow } from "@/components/blocks/ServiceRow";
import { StatsBand } from "@/components/blocks/StatsBand";
import { Steps } from "@/components/blocks/Steps";
import { Testimonials } from "@/components/blocks/Testimonials";
import { DemoForm } from "@/components/forms/DemoForm";
import { FormDone, LeadForm } from "@/components/forms/LeadForm";
import { FreeTestForm } from "@/components/forms/FreeTestForm";
import { Footer } from "@/components/layout/Footer";
import { Header } from "@/components/layout/Header";
import { MobileActionBar } from "@/components/layout/MobileActionBar";
import { AvatarReveal } from "@/components/media/AvatarReveal";
import { BeforeAfter } from "@/components/media/BeforeAfter";
import { Timecode } from "@/components/media/Timecode";
import { ViewfinderFrame } from "@/components/media/ViewfinderFrame";
import { HeroTitle } from "@/components/type/HeroTitle";
import { ButtonLink } from "@/components/ui/Button";
import { StaticChips } from "@/components/ui/ChipGroup";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { SampleLabel } from "@/components/ui/SampleLabel";
import { Hl, SectionHead } from "@/components/ui/Section";
import { WhatsAppIcon } from "@/components/ui/Icons";
import type { Tone } from "@/content/types";
import {
  getAvatars,
  getBeforeAfter,
  getClients,
  getFaqs,
  getOtherPricing,
  getPortfolio,
  getPropertyPricing,
  getReviews,
  getSiteSettings,
  getStats,
} from "@/lib/data";
import { formatNumber, formatUSD } from "@/lib/format";
import { ToneToggle } from "./ToneToggle";
import "./styleguide.css";

export const metadata: Metadata = {
  title: "Styleguide",
  robots: { index: false, follow: false },
};

const TONES: Tone[] = ["dark", "light"];

const DARK_TOKENS = [
  ["--bg", "#111111"],
  ["--surface", "#191919"],
  ["--surface-2", "#222120"],
  ["--line", "#2E2D2B"],
  ["--fg", "#EDEDEA"],
  ["--muted", "#8E8C87"],
  ["--btn / --btn-ink", "#E6D3A3 / #111111"],
  ["--acc", "#E6D3A3"],
  ["--hl-bg / --hl-fg", "transparent / #E6D3A3"],
  ["--rec", "#E5484D"],
] as const;
const LIGHT_TOKENS = [
  ["--bg", "#F5F4F0"],
  ["--surface", "#FFFFFF"],
  ["--surface-2", "#ECE9E2"],
  ["--line", "#DAD6CD"],
  ["--fg", "#111110"],
  ["--muted", "#5F5A52"],
  ["--btn / --btn-ink", "#111110 / #F5F4F0"],
  ["--acc", "#7A5C2E"],
  ["--hl-bg / --hl-fg", "#E6D3A3 / #111110"],
  ["--rec", "#E5484D"],
] as const;

const HERO_TITLES: { page: string; line1: ReactNode; line2: ReactNode }[] = [
  {
    page: "Home",
    line1: (
      <>
        Content that <Hl>sells</Hl>
      </>
    ),
    line2: "property & brands.",
  },
  { page: "Production", line1: "Monthly content,", line2: <Hl>shot &amp; edited.</Hl> },
  { page: "Property shoots", line1: "Don't just list.", line2: <Hl>Dominate.</Hl> },
  { page: "Post-production", line1: "Your remote", line2: <Hl>edit team.</Hl> },
  { page: "AI avatars", line1: "Meet Adam.", line2: <Hl>He isn&apos;t real.</Hl> },
  { page: "Contact", line1: "Tell us what", line2: "you need." },
];

/** One review block: a dark panel and a light panel of the same content. */
function Both({
  id,
  title,
  note,
  children,
}: {
  id: string;
  title: string;
  note?: string;
  children: (tone: Tone) => ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="sg-block">
      <div className="sg-label w">
        <h2 id={`${id}-h`}>{title}</h2>
        {note && <p>{note}</p>}
      </div>
      {TONES.map((tone) => (
        <div key={tone} data-tone={tone} className="sg-panel" data-panel={tone}>
          <span className="sg-tone w">{tone === "dark" ? "Dark tone" : "Light tone"}</span>
          {children(tone)}
        </div>
      ))}
    </section>
  );
}

const TOC = [
  ["tokens", "Tokens"],
  ["type", "Type"],
  ["hero", "Hero titles"],
  ["controls", "Buttons and controls"],
  ["header", "Header and mobile bar"],
  ["media", "Media frames"],
  ["beforeafter", "Before / after"],
  ["avatar", "Avatar reveal"],
  ["proof", "Proof, needs, services"],
  ["reels", "Reels and stats"],
  ["process", "Steps, founder, reviews"],
  ["faq", "FAQ"],
  ["production", "Production blocks"],
  ["property", "Property blocks"],
  ["booking", "Booking builder"],
  ["post", "Post-production blocks"],
  ["ai", "AI avatar blocks"],
  ["forms", "Forms"],
  ["band", "CTA band and footer"],
] as const;

export default async function StyleguidePage() {
  const [
    site,
    clients,
    statsHome,
    statsPost,
    faqs,
    reviews,
    reels,
    rowProd,
    rowPost,
    rowAv,
    pairs,
    avatars,
    property,
    other,
    gallery,
  ] = await Promise.all([
    getSiteSettings(),
    getClients(),
    getStats("home"),
    getStats("post-production"),
    getFaqs("home"),
    getReviews("home"),
    getPortfolio("home-reels"),
    getPortfolio("home-row-production"),
    getPortfolio("home-row-post"),
    getPortfolio("home-row-avatars"),
    getBeforeAfter(),
    getAvatars(),
    getPropertyPricing(),
    getOtherPricing(),
    getPortfolio("property-gallery-photo"),
  ]);
  const heroPair = pairs.find((p) => p.inHero) ?? pairs[0];
  const adam = avatars[0];
  const rate = (k: string) => other.postProduction.rates.find((r) => r.key === k)!;

  return (
    <div className="sg" data-tone="dark">
      <div className="sg-intro">
        <div className="w stack" style={{ gap: 14 }}>
          <Eyebrow rec>Milkywayy · design system · Phase 1 review</Eyebrow>
          <h1 className="d h2">Styleguide</h1>
          <p className="lede">
            Every token and component in both tones. Copy and prices come from the content seed.
            Placeholder media is marked. Interactions that belong to later phases (form submission,
            booking logic, video playback) are static here.
          </p>
          <ToneToggle />
          <nav aria-label="Styleguide sections" className="sg-toc">
            {TOC.map(([id, label]) => (
              <a key={id} href={`#${id}`}>
                {label}
              </a>
            ))}
          </nav>
        </div>
      </div>

      <Both
        id="tokens"
        title="Tokens"
        note="Scoped to [data-tone]. Champagne is never text on light; brass replaces it."
      >
        {(tone) => (
          <div className="w sg-swatches">
            {(tone === "dark" ? DARK_TOKENS : LIGHT_TOKENS).map(([name, value]) => (
              <div key={name} className="sg-swatch">
                <i style={{ background: `var(${name.split(" ")[0]})` }} />
                <b>{name}</b>
                <span>{value}</span>
              </div>
            ))}
          </div>
        )}
      </Both>

      <Both
        id="type"
        title="Type"
        note="Archivo (wdth axis) for display and body, DM Mono for labels."
      >
        {() => (
          <div className="w stack" style={{ gap: 28 }}>
            <div className="stack" style={{ gap: 8 }}>
              <span className="sg-meta">
                h2 · Archivo 800 · wdth 68 · clamp(2.1rem, 4.6vw, 3.8rem)
              </span>
              <h2 className="d h2">
                Three services. <Hl>One studio.</Hl>
              </h2>
            </div>
            <div className="stack" style={{ gap: 8 }}>
              <span className="sg-meta">h3 · Archivo 700 · wdth 74</span>
              <h3 className="d h3">Shoot and edit, handled end to end.</h3>
            </div>
            <div className="stack" style={{ gap: 8 }}>
              <span className="sg-meta">Lede · 17–20px · muted</span>
              <p className="lede">
                We shoot and edit in the UAE, edit remotely for studios abroad, and build AI
                presenters for people who&apos;d rather not be on camera.
              </p>
            </div>
            <div className="stack" style={{ gap: 8 }}>
              <span className="sg-meta">Body · 16px · line-height 1.55 · max ~60ch</span>
              <p style={{ margin: 0, maxWidth: "60ch" }}>
                Monthly content for agencies and brands: shoot days, reels and long-form. Or one
                property shoot, booked in a minute. Photos are back in 24 hours.
              </p>
            </div>
            <div className="stack" style={{ gap: 8 }}>
              <span className="sg-meta">Quote · Archivo 600 · wdth 86 · sentence case</span>
              <blockquote className="sg-quote">“You book, we shoot, you download.”</blockquote>
            </div>
            <div className="stack" style={{ gap: 8 }}>
              <span className="sg-meta">Labels · DM Mono 500 · 11–13px · uppercase</span>
              <Eyebrow>What we do</Eyebrow>
              <div className="anchor">
                <span>
                  Packages from <b>AED {formatNumber(other.production.fromMonthly)}/mo</b>
                </span>
                <span>
                  Single shoots from <b>AED {formatNumber(property.apartment.sizes[0].photo)}</b>
                </span>
              </div>
            </div>
          </div>
        )}
      </Both>

      <Both
        id="hero"
        title="Hero titles"
        note="Always exactly two lines. The widest line is fitted to the column after fonts load and on resize. Resize the window to check."
      >
        {() => (
          <div className="w sg-heroes">
            {HERO_TITLES.map((t) => (
              <div key={t.page} className="stack" style={{ gap: 10 }}>
                <span className="sg-meta">{t.page}</span>
                <HeroTitle line1={t.line1} line2={t.line2} />
              </div>
            ))}
            <div className="stack" style={{ gap: 10 }}>
              <span className="sg-meta">Hero in a half-width column (as on service pages)</span>
              <div className="sg-half">
                <HeroTitle line1="Your remote" line2={<Hl>edit team.</Hl>} />
                <div />
              </div>
            </div>
          </div>
        )}
      </Both>

      <Both
        id="controls"
        title="Buttons and controls"
        note="Square corners. 1px lift on hover. Focus ring uses --acc."
      >
        {() => (
          <div className="w stack" style={{ gap: 28 }}>
            <div className="ctas">
              <ButtonLink href="#controls">Get a quote</ButtonLink>
              <ButtonLink href="#controls" variant="ghost">
                WhatsApp us
              </ButtonLink>
              <ButtonLink href="#controls" variant="link">
                Explore production →
              </ButtonLink>
              <ButtonLink href="#controls" size="sm">
                Small primary
              </ButtonLink>
              <a className="icon-btn" href="#controls" aria-label="WhatsApp us (example)">
                <WhatsAppIcon />
              </a>
            </div>
            <div className="ctas" style={{ alignItems: "center" }}>
              <Eyebrow rec>Eyebrow with REC dot</Eyebrow>
              <Eyebrow>Plain eyebrow</Eyebrow>
              <SampleLabel>Sample text · replace with real Google reviews</SampleLabel>
              <span className="launch">{other.aiAvatars.launchLine}</span>
            </div>
            <StaticChips items={other.production.chips} />
          </div>
        )}
      </Both>

      <Both
        id="header"
        title="Header and mobile action bar"
        note="Header takes the page tone. Under 1020px it collapses to logo + Get a quote + menu (open it at phone width). The mobile bar is fixed to the bottom on phones; shown inline here."
      >
        {() => (
          <div className="stack" style={{ gap: 24 }}>
            <Header path="/production" sticky={false} />
            <div className="w" style={{ width: "100%" }}>
              <MobileActionBar
                pageName="Production"
                label="Get your package"
                href="#header"
                inline
              />
            </div>
          </div>
        )}
      </Both>

      <Both
        id="media"
        title="Viewfinder frames"
        note="Corner brackets, timecode, top-left meta, tag, square play. Placeholder swatches until real media."
      >
        {() => (
          <div className="w sg-media">
            <ViewfinderFrame
              media={site.showreel}
              aspect="4/5"
              topLeft="4K · 25P"
              timecode={<Timecode />}
              play="icon"
              tag="Showreel 2026"
              tagRight={site.showreel.duration}
            />
            <ViewfinderFrame
              media={{ alt: "Placeholder: apartment interior", placeholder: "interior" }}
              aspect="4/3"
              topLeft="F/8 · ISO 100"
              tag="Dubai Marina · 2BR"
              tagRight="Photo 07 / 32"
            />
            <div className="trio">
              {reels.slice(0, 3).map((r) => (
                <ViewfinderFrame key={r.id} media={r.media} small play="icon" />
              ))}
            </div>
          </div>
        )}
      </Both>

      <Both
        id="beforeafter"
        title="Before / after"
        note="Drag, or focus the slider and use the arrow keys."
      >
        {() => (
          <div className="w stack" style={{ gap: 40 }}>
            {heroPair && (
              <div style={{ maxWidth: 640 }}>
                <BeforeAfter pair={heroPair} />
              </div>
            )}
            <BeforeAfterGallery pairs={pairs} />
          </div>
        )}
      </Both>

      <Both
        id="avatar"
        title="Avatar reveal"
        note="Toggle overlays the “100% AI” reveal on the Adam frame."
      >
        {() =>
          adam ? (
            <div className="w" style={{ maxWidth: 520 }}>
              <AvatarReveal
                media={adam.poster}
                captionLead="Dubai rents are up again this quarter. Here's what that means"
                captionHighlight="for buyers."
              />
            </div>
          ) : null
        }
      </Both>

      <Both id="proof" title="Proof strip, need selector, service rows">
        {() => (
          <div className="stack" style={{ gap: 40 }}>
            <ProofStrip clients={clients} rating={site.googleRating.value} />
            <div className="w" style={{ maxWidth: 640, marginInline: "auto" }}>
              <NeedSelector
                needs={[
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
                ]}
              />
            </div>
            <div className="w doors">
              <ServiceRow
                kicker="01 · Production · UAE"
                title="Shoot and edit, handled end to end."
                text="Monthly content for agencies and brands: shoot days, reels and long-form. Or one property shoot, booked in a minute."
                price={
                  <>
                    Packages from <b>AED {formatNumber(other.production.fromMonthly)} / month</b> ·
                    Shoots from <b>AED {formatNumber(property.apartment.sizes[0].photo)}</b>
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
                    Edits from <b>{formatUSD(rate("photo").amount)} per photo</b> · Free test edit
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
        )}
      </Both>

      <Both
        id="reels"
        title="Reel strip and stats band"
        note="Stats: home order and labels, then post-production order with the per-placement label override."
      >
        {() => (
          <div className="w stack" style={{ gap: 48 }}>
            <div>
              <ReelStrip items={reels} eyebrow="Selected work" title="Made for the feed." />
            </div>
            <StatsBand stats={statsHome} />
            <StatsBand stats={statsPost} />
          </div>
        )}
      </Both>

      <Both id="process" title="Steps, founder block, testimonials">
        {() => (
          <div className="w stack" style={{ gap: 64 }}>
            <div>
              <SectionHead eyebrow="How we work" title="Brief to delivery." />
              <Steps
                steps={[
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
                  {
                    n: "03",
                    title: "Edit",
                    text: "In-house editors. Photos in 24 hours, reels in 24–48.",
                  },
                  {
                    n: "04",
                    title: "Deliver",
                    text: "Files, invoices and revision requests in your client dashboard.",
                  },
                ]}
              />
            </div>
            <div>
              <SectionHead eyebrow="How it works" title="Send. Edit. Done." />
              <Steps
                steps={[
                  {
                    n: "01",
                    title: "Upload",
                    text: "Dropbox, Google Drive or WeTransfer. Whatever you use now.",
                  },
                  { n: "02", title: "Edit", text: "Your saved style, applied by a named editor." },
                  {
                    n: "03",
                    title: "Review",
                    text: "Check the batch in your folder or a review link.",
                  },
                  { n: "04", title: "Revise", text: "Two rounds included." },
                  {
                    n: "05",
                    title: "Deliver",
                    text: "Final files, named and sized for MLS and social.",
                  },
                ]}
              />
            </div>
            <FounderBlock founder={site.founder} />
            <div>
              <SectionHead eyebrow="Client words" title="What clients say." />
              <Testimonials reviews={reviews} />
            </div>
          </div>
        )}
      </Both>

      <Both id="faq" title="FAQ" note="Drafts carry a label and are left out of FAQPage JSON-LD.">
        {() => (
          <div className="w">
            <FAQ
              title="Before you ask."
              lede="Anything else: WhatsApp us and a real person replies."
              faqs={faqs}
            />
          </div>
        )}
      </Both>

      <Both id="production" title="Production blocks">
        {() => (
          <div className="w stack" style={{ gap: 48 }}>
            <PathCards
              paths={[
                {
                  kicker: "Monthly packages · this page",
                  title: "For agencies and brands",
                  text: "A monthly plan of shoot days, reels and long-form, scheduled with you and delivered to your dashboard.",
                  cta: "See packages ↓",
                  href: "#production",
                  current: true,
                },
                {
                  kicker: "Single shoot",
                  title: "For one property",
                  text: "Pick the property and services, see the price, request a slot. Photos back in 24 hours.",
                  cta: "Book a property shoot →",
                  href: "/production/property-shoots",
                },
              ]}
            />
            <IncludedGrid
              items={[
                {
                  kicker: "Shoot",
                  title: "Half or full shoot days",
                  text: "4-hour half days or full days, anywhere in Dubai.",
                },
                {
                  kicker: "Short-form",
                  title: "Edited reels",
                  text: "Vertical reels for Instagram and TikTok, captioned and branded.",
                },
                {
                  kicker: "Long-form",
                  title: "Walkthroughs and YouTube",
                  text: "Horizontal videos for listings, launches and your channel.",
                },
                {
                  kicker: "Revisions",
                  title: "Included on every edit",
                  text: "Changes handled inside the dashboard, not over endless chats.",
                },
                {
                  kicker: "Delivery",
                  title: "Client dashboard",
                  text: "Files, status and invoices in one place, stored permanently.",
                },
                {
                  kicker: "Transparency",
                  title: "Monthly statement",
                  text: "Every shoot and edit delivered that month, with what it cost.",
                },
              ]}
            />
            <PackagesBand
              fromMonthly={other.production.fromMonthly}
              chips={other.production.chips}
              actions={
                <>
                  <ButtonLink href="#forms">Get your package</ButtonLink>
                  <ButtonLink href="#production" variant="ghost">
                    WhatsApp us
                  </ButtonLink>
                </>
              }
            />
          </div>
        )}
      </Both>

      <Both
        id="property"
        title="Property shoot blocks"
        note="Dashboard rows are illustrative. The dashboard itself is a pre-launch decision (DECISIONS.md)."
      >
        {() => (
          <div className="w stack" style={{ gap: 48 }}>
            <SampleGallery
              items={{
                photo: gallery,
                video: reels.filter((r) => r.category === "property"),
                "360": [],
              }}
            />
            <div className="dash">
              <div className="stack">
                <span className="eb">After you book</span>
                <h2 className="d h2">Everything in one dashboard.</h2>
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
        )}
      </Both>

      <Both
        id="booking"
        title="Booking builder"
        note="Static look only; open and close the cards. Prices, locks and the message builder are Phase 3."
      >
        {() => (
          <div className="w">
            <BookingDemo pricing={property} />
          </div>
        )}
      </Both>

      <Both id="post" title="Post-production blocks">
        {() => (
          <div className="w stack" style={{ gap: 48 }}>
            <ServiceCards4
              cards={[
                {
                  kicker: "Photo edits",
                  title: "HDR, twilight, sky, declutter",
                  text: "Bracket blending, window pulls, colour correction, virtual twilight and object removal.",
                  price: `From ${formatUSD(rate("photo").amount)} / ${rate("photo").unit}`,
                  cta: "Free test",
                  href: "/post-production/free-test",
                  media: { alt: "Placeholder: twilight edit", placeholder: "villa-dusk" },
                  tag: "Twilight",
                },
                {
                  kicker: "Short-form",
                  title: "Social media reels",
                  text: "Vertical edits for Instagram, TikTok and Shorts with music, captions and your branding.",
                  price: `From ${formatUSD(rate("short").amount)} / ${rate("short").unit}`,
                  cta: "Free test",
                  href: "/post-production/free-test",
                  media: { alt: "Placeholder: short-form edit", placeholder: "night" },
                  play: true,
                },
                {
                  kicker: "Long-form",
                  title: "YouTube and walkthroughs",
                  text: "Tours, launches, vlogs and explainers, cut to hold attention with b-roll and graphics.",
                  price: `From ${formatUSD(rate("long").amount)} / ${rate("long").unit}`,
                  cta: "Free test",
                  href: "/post-production/free-test",
                  media: { alt: "Placeholder: long-form edit", placeholder: "salon" },
                  play: true,
                },
                {
                  kicker: "AI avatars",
                  title: "Avatar generation",
                  text: "Custom AI presenters for your clients, produced under your brand.",
                  price: "White-label",
                  cta: "See AI avatars",
                  href: "/ai-avatars",
                  media: { alt: "Placeholder: AI avatar", placeholder: "adam" },
                  clean: true,
                },
              ]}
            />
            <div>
              <SectionHead
                eyebrow="Starting rates"
                title="Price per edit."
                aside={<p className="lede">{other.postProduction.note}</p>}
              />
              <RateCards rates={other.postProduction.rates} />
            </div>
          </div>
        )}
      </Both>

      <Both id="ai" title="AI avatar blocks">
        {() => (
          <div className="w stack" style={{ gap: 48 }}>
            <div className="sg-avs">
              {avatars.map((a) => (
                <figure key={a.id} style={{ margin: 0 }} className="stack">
                  <ViewfinderFrame media={a.poster} small clean corners={false} aspect="3/4" />
                  <figcaption>
                    <b style={{ display: "block", fontWeight: 600 }}>{a.name}</b>
                    <span className="muted" style={{ font: "400 12px/1.4 var(--font-mono)" }}>
                      {a.niche}
                    </span>
                  </figcaption>
                </figure>
              ))}
            </div>
            <div>
              <SectionHead
                eyebrow="Plans"
                title="Three ways in."
                aside={<span className="launch">{other.aiAvatars.launchLine}</span>}
              />
              <AiTiers
                tiers={other.aiAvatars.tiers}
                note={other.aiAvatars.extraAvatarNote}
                action={(feat) => (
                  <ButtonLink href="#forms" variant={feat ? "primary" : "ghost"}>
                    Book a demo
                  </ButtonLink>
                )}
              />
            </div>
          </div>
        )}
      </Both>

      <Both
        id="forms"
        title="Forms"
        note="Layout and step switching only. Validation, saving the lead and the hand-off are Phase 6."
      >
        {() => (
          <div className="w stack" style={{ gap: 56 }}>
            <div className="formwrap">
              <div className="stack">
                <span className="eb">Start</span>
                <h2 className="d h2">Get your package.</h2>
                <div className="direct">
                  <div>
                    <span>WhatsApp</span>
                    {site.whatsapp.display}
                  </div>
                  <div>
                    <span>Email</span>
                    {site.email}
                  </div>
                </div>
              </div>
              <LeadForm briefPlaceholder="e.g. about 10 listings a month in Marina and JLT, plus brand content" />
            </div>
            <div className="formwrap">
              <div className="stack">
                <span className="eb">Contact · service cards</span>
                <FormDone
                  title="Request received."
                  text="WhatsApp opens with your details filled in."
                  reference="MW-1043"
                />
                <span className="sg-meta">Error state</span>
                <label className="fld">
                  Email
                  <input aria-invalid="true" defaultValue="sara@" />
                  <span className="err">Add the part after the @, like sara@harbour.ae</span>
                </label>
              </div>
              <LeadForm showServices briefLabel="Anything we should know?" />
            </div>
            <div className="formwrap">
              <div className="stack">
                <span className="eb">AI demo form</span>
                <p className="muted" style={{ margin: 0 }}>
                  Pick “Other” to reveal the text field.
                </p>
              </div>
              <DemoForm />
            </div>
            <div className="formwrap">
              <div className="stack">
                <span className="eb">Free test edit · 3 steps</span>
                <div className="direct">
                  <div>
                    <span>Test size</span>1 listing (up to 10 photos) or 1 reel
                  </div>
                  <div>
                    <span>Commitment</span>None
                  </div>
                </div>
              </div>
              <FreeTestForm />
            </div>
          </div>
        )}
      </Both>

      <Both
        id="band"
        title="CTA band"
        note="Champagne on dark pages, black with a champagne button on light pages."
      >
        {(tone) => (
          <CTABand
            title={tone === "dark" ? "Tell us what you're working on." : "Try us on one project."}
            text={
              tone === "dark"
                ? "We reply within 15 minutes during working hours."
                : "Free test edit. No contract. Your style, matched."
            }
            actions={
              <>
                <ButtonLink href="#band">
                  {tone === "dark" ? "Get a quote" : "Book a free test"}
                </ButtonLink>
                <ButtonLink href="#band" variant="ghost">
                  WhatsApp us
                </ButtonLink>
              </>
            }
          />
        )}
      </Both>

      <div className="sg-label w" style={{ paddingTop: 48 }}>
        <h2>Footer</h2>
        <p>Always dark, on every page.</p>
      </div>
      <Footer site={site} />
    </div>
  );
}
