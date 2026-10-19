import { Ctas } from "@/components/ui/Ctas";
import type { Metadata } from "next";
import { CTABand } from "@/components/blocks/CTABand";
import { ProofStrip } from "@/components/blocks/ProofStrip";
import { Steps, type Step } from "@/components/blocks/Steps";
import { MediaFrame } from "@/components/media/MediaFrame";
import { HeroTitle } from "@/components/type/HeroTitle";
import { ButtonLink } from "@/components/ui/Button";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { LAUNCH } from "@/content/launch";
import { SampleLabel } from "@/components/ui/SampleLabel";
import { Hl, SectionHead } from "@/components/ui/Section";
import { getClients, getSiteSettings } from "@/lib/data";
import { pageWhatsappLink } from "@/lib/whatsapp";
import { pageMetadata } from "@/lib/seo/meta";
import { PageLd } from "@/components/seo/JsonLd";

export async function generateMetadata(): Promise<Metadata> {
  return pageMetadata("about");
}

const STORY = [
  "We've filmed some of Dubai's most recognisable addresses, from Atlantis The Royal and Burj Khalifa to private villas across Palm Jumeirah and its Billionaires' Row. More than 1,000 properties, with homes valued up to AED 200 million.",
  "Different spaces, different challenges, one standard: every project should look its best.",
  "That experience shapes everything we do, whether we're shooting in Dubai, editing for a studio abroad, or building an AI presenter for a growing brand.",
];

const TEAM = [
  {
    title: "Production",
    text: "On-location photo and video for properties, brands and businesses across Dubai and the UAE.",
  },
  {
    title: "Post-production",
    text: "Reliable editing for creative teams worldwide, from one-off projects to ongoing white-label partnerships.",
  },
  {
    title: "AI presenters",
    text: "Consistent, presenter-led video without organising a new shoot every time.",
  },
];

const STEPS: Step[] = [
  {
    n: "01",
    title: "Brief",
    text: "Tell us what you're creating. We'll agree scope, timeline and budget, and recommend the right approach.",
  },
  {
    n: "02",
    title: "Create",
    text: "A shoot in Dubai, editing from your footage, or AI-generated content. We handle the production.",
  },
  {
    n: "03",
    title: "Refine",
    text: "Review, share feedback and request revisions, without endless back-and-forth.",
  },
  {
    n: "04",
    title: "Deliver",
    text: "Final files, project updates and invoices, all in your client dashboard.",
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
            <HeroTitle
              id="about-title"
              line1="From Dubai's landmarks"
              line2={<Hl>to screens worldwide.</Hl>}
            />
            <p className="lede">
              We&apos;ve captured over 1,000 properties across Dubai, from residences at Atlantis
              The Royal and Burj Khalifa to extraordinary private villas. Today we bring the same
              attention to detail to brand production, editing and AI video for clients around the
              world.
            </p>
            <Ctas>
              <ButtonLink href="/contact">Get a quote</ButtonLink>
              <ButtonLink href="/work" variant="ghost">
                See our work
              </ButtonLink>
            </Ctas>
          </div>
          <div className="hero-media-col">
            <MediaFrame
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
              Remarkable places. Better stories.
            </h2>
            {!LAUNCH.aboutConfirmed && <SampleLabel>Draft · owner to confirm</SampleLabel>}
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
          <SectionHead
            id="team-title"
            eyebrow="The team"
            title="One studio. Three ways to create."
            aside={<p className="lede">Different needs. One team to coordinate them.</p>}
          />
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
              Rooted in the UAE. Working everywhere.
            </h2>
          </div>
          <div className="direct">
            <div>
              <span>Company</span>
              {site.company}
            </div>
            <div>
              <span>Registered in</span>
              {site.licence} Free Zone, UAE
            </div>
            <div>
              <span>Production base</span>
              {site.addressLine}
            </div>
            <div>
              <span>Remote services</span>
              Worldwide
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
        text="A property shoot in Dubai? An editing partner for your studio? Something entirely new? Tell us what you have in mind."
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
