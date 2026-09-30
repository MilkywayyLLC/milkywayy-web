import type { Metadata } from "next";
import { CTABand } from "@/components/blocks/CTABand";
import { FAQ } from "@/components/blocks/FAQ";
import { IncludedGrid, type Included } from "@/components/blocks/IncludedGrid";
import { PackagesBand } from "@/components/blocks/PackagesBand";
import { PathCards } from "@/components/blocks/PathCards";
import { ProofStrip } from "@/components/blocks/ProofStrip";
import { Steps, type Step } from "@/components/blocks/Steps";
import { LeadForm } from "@/components/forms/LeadForm";
import { ViewfinderFrame } from "@/components/media/ViewfinderFrame";
import { HeroTitle } from "@/components/type/HeroTitle";
import { ButtonLink } from "@/components/ui/Button";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { Hl, SectionHead } from "@/components/ui/Section";
import {
  getClients,
  getFaqs,
  getOtherPricing,
  getPortfolio,
  getPropertyPricing,
  getSiteSettings,
  showsProofStrip,
} from "@/lib/data";
import { formatNumber } from "@/lib/format";
import { pageWhatsappLink } from "@/lib/whatsapp";
import { lowestShootPrice } from "@/lib/pricing";

export const metadata: Metadata = {
  title: { absolute: "Content Production Packages in Dubai | Milkywayy" },
  description:
    "Monthly shoot days, edited reels and long-form video for UAE agencies, developers and brands. One Dubai team films, edits and delivers. Packages from AED 4,000.",
  alternates: { canonical: "/production" },
};

const INCLUDED: Included[] = [
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
];

const STEPS: Step[] = [
  {
    n: "Day 1",
    title: "Onboarding",
    text: "A short call about your brand and listings. We collect logos, fonts and references.",
  },
  {
    n: "Week 1",
    title: "Book shoot days",
    text: "Pick your dates in the dashboard. We confirm the crew and locations.",
  },
  {
    n: "Weeks 1–4",
    title: "Shoot and edit",
    text: "Edits land in your dashboard. Request changes there, not over chat.",
  },
  {
    n: "Month end",
    title: "Statement",
    text: "A clear list of everything delivered and billed that month.",
  },
];

export default async function ProductionPage() {
  const [site, clients, proof, faqs, hero, other, property] = await Promise.all([
    getSiteSettings(),
    getClients(),
    showsProofStrip("production"),
    getFaqs("production"),
    getPortfolio("production-hero"),
    getOtherPricing(),
    getPropertyPricing(),
  ]);
  const whatsapp = pageWhatsappLink("Production");
  const from = formatNumber(other.production.fromMonthly);

  return (
    <>
      <div className="w">
        <section className="p-hero" aria-labelledby="production-title">
          <div className="stack">
            <Eyebrow rec>Production · UAE</Eyebrow>
            <HeroTitle
              id="production-title"
              line1="Monthly content,"
              line2={<Hl>shot &amp; edited.</Hl>}
            />
            <p className="lede">
              Shoot days, reels and long-form for agencies, developers and brands in the UAE. One
              team films, edits and delivers, every month.
            </p>
            <div className="ctas">
              <ButtonLink href="#get-your-package">Get your package</ButtonLink>
              <ButtonLink href={whatsapp} variant="ghost">
                WhatsApp us
              </ButtonLink>
            </div>
            <div className="anchor">
              <span>
                Packages from <b>AED {from}/mo</b>
              </span>
              <span>
                Single shoots from <b>AED {formatNumber(lowestShootPrice(property))}</b>
              </span>
            </div>
          </div>
          {hero.length > 0 && (
            <div className="trio">
              {hero.slice(0, 3).map((m, i) => (
                <ViewfinderFrame
                  key={m.id}
                  media={m.media}
                  small
                  play="icon"
                  priority={i === 1}
                  sizes="(max-width: 900px) 33vw, 15vw"
                />
              ))}
            </div>
          )}
        </section>
      </div>

      {proof && <ProofStrip clients={clients} rating={site.googleRating.value} />}

      <section className="sec" aria-labelledby="paths-title">
        <div className="w">
          <SectionHead
            id="paths-title"
            eyebrow="Two ways to work with us"
            title="Every month, or one listing."
          />
          <PathCards
            paths={[
              {
                kicker: "Monthly packages · this page",
                title: "For agencies and brands",
                text: "A monthly plan of shoot days, reels and long-form, scheduled with you and delivered to your dashboard.",
                cta: "See packages ↓",
                href: "#packages",
                current: true,
              },
              {
                kicker: "Single shoot",
                title: "For one property",
                text: "Pick the property and services, see the price, request a slot. Photos back in 24 hours.",
                cta: "Book a property shoot →",
                href: "/property-shoots",
              },
            ]}
          />
        </div>
      </section>

      <section className="sec alt" aria-labelledby="included-title">
        <div className="w">
          <SectionHead
            id="included-title"
            eyebrow="What's included"
            title="Everything, one invoice."
            aside={
              <p className="lede">
                You tell us what to shoot. We handle the crew, the edit and the delivery.
              </p>
            }
          />
          <IncludedGrid items={INCLUDED} />
        </div>
      </section>

      <section className="sec" id="packages" aria-label="Packages">
        <div className="w">
          <PackagesBand
            fromMonthly={other.production.fromMonthly}
            chips={other.production.chips}
            actions={
              <>
                <ButtonLink href="#get-your-package">Get your package</ButtonLink>
                <ButtonLink href={whatsapp} variant="ghost">
                  WhatsApp us
                </ButtonLink>
              </>
            }
          />
        </div>
      </section>

      <section className="sec" style={{ paddingTop: 0 }} aria-labelledby="first-month-title">
        <div className="w">
          <SectionHead id="first-month-title" eyebrow="How it works" title="Your first month." />
          <Steps steps={STEPS} />
        </div>
      </section>

      <section className="sec alt" aria-label="Questions">
        <div className="w">
          <FAQ title="Production FAQ." faqs={faqs} />
        </div>
      </section>

      <section className="sec" id="get-your-package" aria-labelledby="form-title">
        <div className="w formwrap">
          <div className="stack">
            <span className="eb">Start</span>
            <h2 className="d h2" id="form-title">
              Get your package.
            </h2>
            <p className="lede">
              Tell us about your team and how much content you need. We reply within 15 minutes
              during working hours.
            </p>
            <div className="direct">
              <div>
                <span>WhatsApp</span>
                <a href={whatsapp} target="_blank" rel="noopener noreferrer">
                  {site.whatsapp.display}
                </a>
              </div>
              <div>
                <span>Email</span>
                <a href={`mailto:${site.email}`}>{site.email}</a>
              </div>
            </div>
          </div>
          <LeadForm
            service="production"
            briefPlaceholder="e.g. about 10 listings a month in Marina and JLT, plus brand content"
          />
        </div>
      </section>

      <CTABand
        title="Your content, sorted every month."
        text="Start with any package. Upgrade anytime."
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
