import type { Metadata } from "next";
import { AiTiers } from "@/components/blocks/AiTiers";
import { CTABand } from "@/components/blocks/CTABand";
import { FAQ } from "@/components/blocks/FAQ";
import { Steps, type Step } from "@/components/blocks/Steps";
import { DemoForm } from "@/components/forms/DemoForm";
import { AvatarStage, RevealButton, RevealProvider } from "@/components/media/AvatarReveal";
import { LiteVideo } from "@/components/media/LiteVideo";
import { ViewfinderFrame } from "@/components/media/ViewfinderFrame";
import { HeroTitle } from "@/components/type/HeroTitle";
import { ButtonLink } from "@/components/ui/Button";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { SampleLabel } from "@/components/ui/SampleLabel";
import { Hl, SectionHead } from "@/components/ui/Section";
import { getAvatarHero, getAvatars, getFaqs, getOtherPricing } from "@/lib/data";
import { pageWhatsappLink } from "@/lib/whatsapp";

export const metadata: Metadata = {
  title: { absolute: "Custom AI Avatar Videos for Brands | Milkywayy" },
  description:
    "A custom AI presenter with its own face and voice, scripted and edited into videos every month. For founders, agents, clinics and brands. Book a demo call.",
  alternates: { canonical: "/ai-avatars" },
};

const PROBLEMS = [
  {
    from: "No time to film",
    title: "Posts go out every week",
    text: "Your avatar never cancels a shoot or needs a second take.",
  },
  {
    from: "Not comfortable on camera",
    title: "A confident face for your brand",
    text: "Pick the look, the voice and the tone. You approve every script.",
  },
  {
    from: "Inconsistent content",
    title: "One host, one style",
    text: "The same presenter across Reels, TikTok, YouTube and ads.",
  },
];

const STEPS: Step[] = [
  { n: "01", title: "Brand brief", text: "Your audience, tone and the kind of face that fits." },
  { n: "02", title: "Design", text: "We create 2–3 looks. You pick one." },
  { n: "03", title: "Voice", text: "Choose from shortlisted voices and accents." },
  { n: "04", title: "Scripts", text: "You send topics or we write them. You approve." },
  { n: "05", title: "Monthly videos", text: "Edited, captioned and ready to post." },
];

const USES = [
  { title: "Listings", text: "Walkthrough voiceovers and new-launch announcements." },
  { title: "Market updates", text: "Weekly prices, rents and trends, in your brand's voice." },
  { title: "Clinic FAQs", text: "Treatments explained clearly, without booking a doctor's time." },
  { title: "Courses", text: "Lessons and onboarding videos at any scale." },
];

export default async function AiAvatarsPage() {
  const [hero, avatars, faqs, other] = await Promise.all([
    getAvatarHero(),
    getAvatars(),
    getFaqs("ai-avatars"),
    getOtherPricing(),
  ]);
  const whatsapp = pageWhatsappLink("AI avatars");
  const ai = other.aiAvatars;

  return (
    <>
      <div className="w">
        <RevealProvider>
          <section className="av-hero" aria-labelledby="avatars-title">
            <div className="stack">
              <Eyebrow>AI avatars · For anyone</Eyebrow>
              <HeroTitle
                id="avatars-title"
                line1={`Meet ${hero.name}.`}
                line2={<Hl>He isn&apos;t real.</Hl>}
              />
              <p className="lede">
                We build AI presenters that look and sound like your brand, then script and edit
                them into videos every month. No camera, no studio, no reshoots.
              </p>
              <div className="ctas">
                <ButtonLink href="#demo">Book a demo call</ButtonLink>
                <RevealButton />
              </div>
              <div className="anchor">
                <span>
                  {hero.proofLead} <b>{hero.proofHighlight}</b>
                </span>
              </div>
            </div>
            <div className="hero-media-col">
              <AvatarStage hero={hero} priority />
              {hero.sample && <SampleLabel>Placeholder · Adam video coming</SampleLabel>}
            </div>
          </section>
        </RevealProvider>
      </div>

      <section className="sec alt" aria-labelledby="why-title">
        <div className="w">
          <SectionHead
            id="why-title"
            eyebrow="Why brands use one"
            title="Video, without the filming."
          />
          <div className="pa">
            {PROBLEMS.map((p) => (
              <div key={p.title}>
                <span className="from">{p.from}</span>
                <b>{p.title}</b>
                <p>{p.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {avatars.length > 0 && (
        <section className="sec" aria-labelledby="styles-title">
          <div className="w">
            <SectionHead
              id="styles-title"
              eyebrow="Avatar styles"
              title="Built for your audience."
              aside={
                avatars.some((a) => a.sample) ? (
                  <SampleLabel>Placeholder avatars · real examples go here</SampleLabel>
                ) : undefined
              }
            />
            <div className="avs">
              {avatars.map((a) => (
                <figure key={a.id}>
                  <ViewfinderFrame
                    media={a.poster}
                    small
                    corners={false}
                    sizes="(max-width: 860px) 50vw, 25vw"
                  >
                    <LiteVideo video={a.clip} title={`${a.name}, AI avatar example`} />
                  </ViewfinderFrame>
                  <figcaption>
                    <b>{a.name}</b>
                    <span>{a.niche}</span>
                  </figcaption>
                </figure>
              ))}
            </div>
          </div>
        </section>
      )}

      <section className="sec alt" aria-labelledby="live-title">
        <div className="w">
          <SectionHead id="live-title" eyebrow="How it works" title="Live in a week." />
          <Steps steps={STEPS} />
        </div>
      </section>

      <section className="sec" aria-labelledby="plans-title">
        <div className="w">
          <SectionHead
            id="plans-title"
            eyebrow="Plans"
            title="Three ways in."
            aside={<span className="launch">{ai.launchLine}</span>}
          />
          <AiTiers
            tiers={ai.tiers}
            note={ai.extraAvatarNote}
            action={(featured) => (
              <ButtonLink href="#demo" variant={featured ? "primary" : "ghost"}>
                Book a demo
              </ButtonLink>
            )}
          />
        </div>
      </section>

      <section className="sec alt" aria-labelledby="uses-title">
        <div className="w">
          <SectionHead id="uses-title" eyebrow="Use cases" title="What it's for." />
          <div className="uses">
            {USES.map((u) => (
              <div key={u.title}>
                <h3 className="d h3">{u.title}</h3>
                <p>{u.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="sec" aria-label="Questions">
        <div className="w">
          <FAQ title="The honest answers." faqs={faqs} />
        </div>
      </section>

      <section className="sec alt" id="demo" aria-labelledby="demo-title">
        <div className="w formwrap">
          <div className="stack">
            <span className="eb">Demo</span>
            <h2 className="d h2" id="demo-title">
              See your avatar idea.
            </h2>
            <p className="lede">
              A 20-minute call. We show live examples and sketch what your presenter could look
              like.
            </p>
          </div>
          <DemoForm />
        </div>
      </section>

      <CTABand
        title="Your brand, on camera. Without you."
        actions={
          <>
            <ButtonLink href="#demo">Book a demo call</ButtonLink>
            <ButtonLink href={whatsapp} variant="ghost">
              WhatsApp us
            </ButtonLink>
          </>
        }
      />
    </>
  );
}
