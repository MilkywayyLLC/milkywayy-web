import { DashboardShowcase } from "@/components/blocks/DashboardShowcase";
import { SHOWCASE } from "@/lib/showcase";
import { Ctas } from "@/components/ui/Ctas";
import type { Metadata } from "next";
import { CTABand } from "@/components/blocks/CTABand";
import { FAQ } from "@/components/blocks/FAQ";
import { Steps, type Step } from "@/components/blocks/Steps";
import { DemoForm } from "@/components/forms/DemoForm";
import { AvatarStage, RevealButton, RevealProvider } from "@/components/media/AvatarReveal";
import { AvatarCarousel } from "@/components/media/AvatarCarousel";
import { MultilingualPlayer } from "@/components/media/MultilingualPlayer";
import { isFileVideo, fileVideoUrl } from "@/lib/media-ref";
import { HeroTitle } from "@/components/type/HeroTitle";
import { ButtonLink } from "@/components/ui/Button";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { SampleLabel } from "@/components/ui/SampleLabel";
import { Hl, SectionHead } from "@/components/ui/Section";
import { getAvatarHero, getAvatars, getFaqs, getSiteSettings } from "@/lib/data";
import { pageWhatsappLink } from "@/lib/whatsapp";
import { pageMetadata } from "@/lib/seo/meta";
import { PageLd } from "@/components/seo/JsonLd";

export async function generateMetadata(): Promise<Metadata> {
  return pageMetadata("ai-avatars");
}

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

/** Shown when no avatar has two language versions yet (no fake switching). */
const LANGUAGES = ["English", "Arabic", "French", "Spanish", "German"];

export default async function AiAvatarsPage() {
  const [hero, avatars, faqs, site] = await Promise.all([
    getAvatarHero(),
    getAvatars(),
    getFaqs("ai-avatars"),
    getSiteSettings(),
  ]);
  const whatsapp = pageWhatsappLink("AI avatars", site.whatsapp.number);
  // The carousel plays hosted files inline; a linked clip shows its poster.
  const deck = avatars.map((a) => ({
    id: a.id,
    name: a.name,
    industry: a.niche.split("·")[0].trim(),
    poster: a.poster,
    src: isFileVideo(a.clip) ? fileVideoUrl(a.clip!) : undefined,
  }));
  // Multilingual: the first avatar with two or more hosted language versions.
  const multi = avatars
    .map((a) => ({
      a,
      versions: (a.versions ?? [])
        .filter((v) => isFileVideo(v.clip))
        .map((v) => ({ language: v.language, src: fileVideoUrl(v.clip) })),
    }))
    .find((m) => m.versions.length >= 2);
  // The Plans section is off the page (12 Oct 2026); its data and admin entries stay.

  return (
    <>
      <PageLd page="ai-avatars" />
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
              <Ctas extraLabels={["Show me the reveal"]}>
                <ButtonLink href="#demo">Book a demo call</ButtonLink>
                <RevealButton />
              </Ctas>
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

      {deck.length > 0 && (
        <section className="sec" aria-labelledby="styles-title">
          <div className="w av-aud">
            <div className="stack">
              <span className="eb">Avatar styles</span>
              <h2 className="d h2" id="styles-title">
                Built for your audience.
              </h2>
              <p className="lede">
                Each presenter is designed for one audience: the look, the voice and the way it
                talks. A few we&apos;ve built:
              </p>
              <ul className="av-ind">
                {avatars.map((a) => (
                  <li key={a.id}>
                    <b>{a.niche.split("·")[0].trim()}</b>
                    <span>
                      {a.name} · {a.niche}
                    </span>
                  </li>
                ))}
              </ul>
              {avatars.some((a) => a.sample) && (
                <SampleLabel>Placeholder avatars · real examples go here</SampleLabel>
              )}
            </div>
            <AvatarCarousel items={deck} />
          </div>
        </section>
      )}

      <section className="sec alt" aria-labelledby="multi-title">
        <div className="w av-multi">
          <div className="stack">
            <span className="eb">Multilingual</span>
            <h2 className="d h2" id="multi-title">
              One presenter, every language.
            </h2>
            <p className="lede">
              The same avatar, script and edit in the languages your clients speak. No re-shoots, no
              new presenter.
            </p>
            {!multi && (
              <ul className="av-langs" aria-label="Languages">
                {LANGUAGES.map((l) => (
                  <li key={l}>{l}</li>
                ))}
              </ul>
            )}
          </div>
          {multi && (
            <MultilingualPlayer
              versions={multi.versions}
              poster={multi.a.poster.src}
              title={`${multi.a.name}, AI avatar`}
            />
          )}
        </div>
      </section>

      <section className="sec" aria-labelledby="live-title">
        <div className="w">
          <SectionHead id="live-title" eyebrow="How it works" title="Live in a week." />
          <Steps steps={STEPS} />
        </div>
      </section>

      <section className="sec alt" aria-labelledby="dashboard-title">
        <div className="w">
          <SectionHead
            id="dashboard-title"
            eyebrow="Your client dashboard"
            title="Approve, track, download."
            aside={
              <p className="lede">
                Scripts, production, finished videos and revisions in one place. Nothing goes into
                production until you approve the script.
              </p>
            }
          />
          <DashboardShowcase features={SHOWCASE.avatars} />
        </div>
      </section>

      <section className="sec" aria-labelledby="uses-title">
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

      <section className="sec alt" aria-label="Questions">
        <div className="w">
          <FAQ title="The honest answers." faqs={faqs} />
        </div>
      </section>

      <section className="sec" id="demo" aria-labelledby="demo-title">
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
          <DemoForm whatsappNumber={site.whatsapp.number} email={site.email} />
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
