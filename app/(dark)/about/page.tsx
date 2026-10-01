import { Ctas } from "@/components/ui/Ctas";
import type { Metadata } from "next";
import { CTABand } from "@/components/blocks/CTABand";
import { ProofStrip } from "@/components/blocks/ProofStrip";
import { Steps, type Step } from "@/components/blocks/Steps";
import { ViewfinderFrame } from "@/components/media/ViewfinderFrame";
import { HeroTitle } from "@/components/type/HeroTitle";
import { ButtonLink } from "@/components/ui/Button";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { SampleLabel } from "@/components/ui/SampleLabel";
import { Hl, SectionHead } from "@/components/ui/Section";
import { getClients, getSiteSettings } from "@/lib/data";
import { pageWhatsappLink } from "@/lib/whatsapp";
import { pageMetadata } from "@/lib/seo/meta";
import { PageLd } from "@/components/seo/JsonLd";

export async function generateMetadata(): Promise<Metadata> {
  return pageMetadata("about");
}

// TODO(owner): confirm the story wording; add team photos/roles if wanted (CONTENT_TODO.md).
const STORY = [
  "Akash Praseed has been creating content since 2020: graphic design first, then content creation, then full production, for clients on site and remote.",
  "Before Milkywayy he created content in-house for a Dubai real estate company, and saw where production slows down: quotes that take days, files chased over chat, revisions that never end.",
  "Milkywayy is built to take those out. Prices you can see, bookings in a minute, and files, revisions and invoices in one place.",
];

const TEAM = [
  {
    title: "Production",
    text: "Photo, video and 360 tours, shot across Dubai for agencies, developers and brands.",
  },
  {
    title: "Editing",
    text: "A team of editors who work to your saved style, for our shoots and for studios abroad.",
  },
  {
    title: "One contact",
    text: "One person from brief to invoice, on WhatsApp, email or a call.",
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

/** About (guide §6.7): founder story, photo, team, how we work, licence, clients, CTA. */
export default async function AboutPage() {
  const [site, clients] = await Promise.all([getSiteSettings(), getClients()]);
  const whatsapp = pageWhatsappLink("About", site.whatsapp.number);

  return (
    <>
      <PageLd page="about" />
      <div className="w">
        <section className="hero about-hero" aria-labelledby="about-title">
          <div className="hero-copy">
            <Eyebrow rec>About</Eyebrow>
            <HeroTitle id="about-title" line1="Creating content" line2={<Hl>since 2020.</Hl>} />
            <p className="lede">
              Milkywayy is a Dubai content studio. We shoot and edit property and brand content in
              the UAE, edit remotely for teams abroad, and build AI presenters for people who&apos;d
              rather not be on camera.
            </p>
            <Ctas>
              <ButtonLink href="/contact">Get a quote</ButtonLink>
              <ButtonLink href="/work" variant="ghost">
                See our work
              </ButtonLink>
            </Ctas>
          </div>
          <div className="hero-media-col">
            <ViewfinderFrame
              media={site.founder.photo}
              corners={false}
              clean
              priority
              sizes="(max-width: 900px) 100vw, 42vw"
            />
          </div>
        </section>
      </div>

      <section className="sec alt" aria-labelledby="story-title">
        <div className="w founder">
          <div className="stack">
            <span className="eb">The story</span>
            <h2 className="d h2" id="story-title">
              From one creator to a studio.
            </h2>
            <SampleLabel>Draft · owner to confirm</SampleLabel>
          </div>
          <div className="stack" style={{ gap: 18 }}>
            {STORY.map((p) => (
              <p key={p} style={{ margin: 0, maxWidth: "60ch" }}>
                {p}
              </p>
            ))}
            <blockquote style={{ fontSize: "clamp(1.2rem, 2vw, 1.6rem)" }}>
              “{site.founder.quote}”
            </blockquote>
            <div className="sig">
              <span>
                <b>{site.founder.name}</b>
                {site.founder.role}
              </span>
            </div>
          </div>
        </div>
      </section>

      <section className="sec" aria-labelledby="team-title">
        <div className="w">
          <SectionHead id="team-title" eyebrow="The team" title="Shooters, editors, one contact." />
          <div className="why">
            {TEAM.map((t) => (
              <div key={t.title}>
                <h3 className="d h3">{t.title}</h3>
                <p>{t.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="sec alt" aria-labelledby="how-title">
        <div className="w">
          <SectionHead id="how-title" eyebrow="How we work" title="Brief to delivery." />
          <Steps steps={STEPS} />
        </div>
      </section>

      <section className="sec" aria-labelledby="licence-title">
        <div className="w formwrap">
          <div className="stack">
            <span className="eb">The company</span>
            <h2 className="d h2" id="licence-title">
              Licensed and based in the UAE.
            </h2>
          </div>
          <div className="direct">
            <div>
              <span>Company</span>
              {site.company}
            </div>
            <div>
              <span>Licence</span>
              {site.licence} free zone
            </div>
            <div>
              <span>Studio</span>
              {site.addressLine}
            </div>
            <div>
              <span>Contact</span>
              <a href={`mailto:${site.email}`}>{site.email}</a>
            </div>
          </div>
        </div>
      </section>

      <ProofStrip clients={clients} rating={site.googleRating.value} />

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
