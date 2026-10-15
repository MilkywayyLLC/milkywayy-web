import { Ctas } from "@/components/ui/Ctas";
import type { Metadata } from "next";
import { CTABand } from "@/components/blocks/CTABand";
import { BeforeAfterGallery } from "@/components/blocks/BeforeAfterGallery";
import { FAQ } from "@/components/blocks/FAQ";
import { ProofStrip } from "@/components/blocks/ProofStrip";
import { RateCards } from "@/components/blocks/RateCards";
import { rowMedia, ServiceRow, type RowMedia } from "@/components/blocks/ServiceRow";
import { StatsBand } from "@/components/blocks/StatsBand";
import { Steps, type Step } from "@/components/blocks/Steps";
import { FreeTestSection } from "@/components/forms/FreeTestSection";
import { DashboardShowcase } from "@/components/blocks/DashboardShowcase";
import { FormatGallery } from "@/components/blocks/FormatGallery";
import { placedShowcase, SHOWCASE } from "@/lib/showcase";
import { HeroMedia } from "@/components/blocks/HeroMedia";
import { postHeroReels } from "@/lib/post-hero";
import { HeroTitle } from "@/components/type/HeroTitle";
import { ButtonLink } from "@/components/ui/Button";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { Hl, SectionHead } from "@/components/ui/Section";
import type { Media } from "@/content/types";
import { kindOf } from "@/lib/media-config";
import { videoPlayable, withPlayback } from "@/lib/playable";
import {
  getAvatars,
  getBeforeAfter,
  getClients,
  getFaqs,
  getOtherPricing,
  getPlaced,
  getPortfolio,
  getSiteSettings,
  getStats,
  showsProofStrip,
} from "@/lib/data";
import { formatUSD } from "@/lib/format";
import { pageMetadata } from "@/lib/seo/meta";
import { PageLd } from "@/components/seo/JsonLd";

export async function generateMetadata(): Promise<Metadata> {
  return pageMetadata("post-production");
}

const WHY = [
  {
    title: "We know the shot",
    text: "We produce for real estate, hospitality, clinics and brands, so we understand the shot before you explain it.",
  },
  {
    title: "Same look, every batch",
    text: "We save your style as a preset and a written guide. Batch 50 looks like batch 1.",
  },
  {
    title: "One team, every format",
    text: "Photos, reels, long-form and AI avatars from one team, in one workflow.",
  },
];

// Guide §6.4 tone rules: no country-specific claims, no "overnight" lines, no guarantees.
const STEPS: Step[] = [
  { n: "01", title: "Upload", text: "Dropbox, Google Drive or WeTransfer. Whatever you use now." },
  { n: "02", title: "Edit", text: "Your saved style, applied by a named editor." },
  { n: "03", title: "Review", text: "Check the batch in your folder or a review link." },
  { n: "04", title: "Revise", text: "Two rounds included." },
  { n: "05", title: "Deliver", text: "Final files, named and sized for MLS and social." },
];

/** Until real work is placed, each row shows a placeholder at its own format's ratio. */
const PLACEHOLDER: Record<"photo" | "reel" | "long-form", Media> = {
  photo: { alt: "HDR real estate photo edit of an apartment interior", placeholder: "interior" },
  reel: { alt: "Short-form social media reel edited for a brand", placeholder: "night" },
  "long-form": {
    alt: "Real estate walkthrough video edit of a villa at dusk",
    placeholder: "villa-dusk",
  },
};

type Row = {
  kicker: string;
  title: string;
  text: string;
  price: string;
  cta: string;
  href: string;
  media: RowMedia;
};

export default async function PostProductionPage() {
  const [
    site,
    clients,
    proof,
    pairs,
    stats,
    faqs,
    other,
    cardMedia,
    avatars,
    heroMedia,
    heroReelMedia,
    allMedia,
  ] = await Promise.all([
    getSiteSettings(),
    getClients(),
    showsProofStrip("post-production"),
    getBeforeAfter(),
    getStats("post-production"),
    getFaqs("post-production"),
    getOtherPricing(),
    getPortfolio("post-service-cards"),
    getAvatars(),
    getPortfolio("post-hero"),
    getPortfolio("post-hero-reels"),
    getPortfolio(),
  ]);
  // Always three reels side by side, like Production (13 Oct 2026): the placement first, then
  // the latest published editing reels (lib/post-hero).
  const showcase = await getPlaced("showcase-photos");
  const [hero, work] = await Promise.all([
    withPlayback(postHeroReels(heroReelMedia, allMedia)),
    // Everything this page shows, once each, for the format gallery.
    withPlayback(
      [...heroReelMedia, ...heroMedia, ...cardMedia].filter(
        (m, i, all) => all.findIndex((x) => x.id === m.id) === i,
      ),
    ),
  ]);
  const rate = (k: "photo" | "short" | "long") =>
    other.postProduction.rates.find((r) => r.key === k);
  const from = (k: "photo" | "short" | "long") => {
    const r = rate(k);
    return r ? `From ${formatUSD(r.amount)} / ${r.unit}` : "";
  };
  // Each row takes the first placed item of its own format (lib/used-on POST_ROWS).
  const media = (k: "photo" | "reel" | "long-form"): RowMedia =>
    rowMedia(work.find((m) => m.id === cardMedia.find((c) => kindOf(c) === k)?.id)) ?? {
      media: PLACEHOLDER[k],
      kind: k,
    };

  const rows: Row[] = [
    {
      kicker: "Photo edits",
      title: "HDR, twilight, sky, declutter",
      text: "Bracket blending, window pulls, colour correction, virtual twilight and object removal.",
      price: from("photo"),
      cta: "Free test",
      href: "#free-test",
      media: media("photo"),
    },
    {
      kicker: "Short-form",
      title: "Social media reels",
      text: "Vertical edits for Instagram, TikTok and Shorts with music, captions and your branding.",
      price: from("short"),
      cta: "Free test",
      href: "#free-test",
      media: media("reel"),
    },
    {
      kicker: "Long-form",
      title: "YouTube and walkthroughs",
      text: "Tours, launches, vlogs and explainers, cut to hold attention with b-roll and graphics.",
      price: from("long"),
      cta: "Free test",
      href: "#free-test",
      media: media("long-form"),
    },
    {
      kicker: "AI avatars",
      title: "Avatar generation",
      text: "Custom AI presenters for your clients, produced under your brand.",
      price: "White-label",
      cta: "See AI avatars",
      href: "/ai-avatars",
      media: {
        media: avatars[0]?.poster ?? {
          alt: "AI avatar video presenter edit",
          placeholder: "adam",
          bright: true,
        },
        kind: "ai-avatar",
        title: avatars[0]?.name,
        play: videoPlayable(
          avatars[0]?.clip,
          avatars[0]?.name ?? "AI avatar",
          "ai-avatar",
          avatars[0]?.poster.src,
        ),
      },
    },
  ];

  return (
    <>
      <PageLd page="post-production" />
      <div className="w">
        <section className="p-hero p-hero-wide" aria-labelledby="post-title">
          <div className="stack">
            <Eyebrow>Post-production · Worldwide</Eyebrow>
            <HeroTitle id="post-title" line1="Your remote" line2={<Hl>edit team.</Hl>} />
            <p className="lede">
              Real estate photo editing, video editing and AI avatars for agencies, media companies
              and creators. We run our own shoots, so we edit like we&apos;ve been on set.
            </p>
            <ul className="checks">
              <li>Photo edits, short-form, long-form and AI avatars</li>
              <li>Your style saved and matched on every batch</li>
              <li>One point of contact, from brief to delivery</li>
            </ul>
            <Ctas>
              <ButtonLink href="#free-test">Book a free test edit</ButtonLink>
              <ButtonLink href="#before-after" variant="ghost">
                See our work
              </ButtonLink>
            </Ctas>
          </div>
          <HeroMedia items={hero} trioSizes="(max-width: 900px) 33vw, 15vw" />
        </section>
      </div>

      {proof && <ProofStrip clients={clients} rating={site.googleRating.value} />}

      <section className="sec alt" aria-labelledby="why-title">
        <div className="w">
          <SectionHead
            id="why-title"
            eyebrow="Why teams work with us"
            title="Editors who also produce."
          />
          <div className="why">
            {WHY.map((w) => (
              <div key={w.title}>
                <h3 className="d h3">{w.title}</h3>
                <p>{w.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="sec" aria-labelledby="services-title">
        <div className="w">
          <SectionHead
            id="services-title"
            eyebrow="Services"
            title="Anything on your plate."
            aside={
              <p className="lede">
                Photo edits, video in any format, or AI avatar generation for your clients. We do it
                all.
              </p>
            }
          />
          <div className="doors">
            {rows.map((r, i) => (
              <ServiceRow key={r.kicker} {...r} flip={i % 2 === 1} />
            ))}
          </div>
        </div>
      </section>

      {pairs.length > 0 && (
        <section className="sec alt" id="before-after" aria-labelledby="compare-title">
          <div className="w">
            <SectionHead id="compare-title" eyebrow="Before / after" title="Drag to compare." />
            <BeforeAfterGallery pairs={pairs} />
          </div>
        </section>
      )}

      <section className="sec" id="rates" aria-labelledby="rates-title">
        <div className="w">
          <SectionHead
            id="rates-title"
            eyebrow="Starting rates"
            title="Price per edit."
            aside={<p className="lede">{other.postProduction.note}</p>}
          />
          <RateCards rates={other.postProduction.rates} snap />
          <Ctas style={{ marginTop: 28 }}>
            <ButtonLink href="#free-test">Get a custom quote</ButtonLink>
          </Ctas>
        </div>
      </section>

      {(stats.length > 0 || work.length > 0) && (
        <section className="sec alt" id="our-work" aria-labelledby="track-title">
          <div className="w stack" style={{ gap: 40 }}>
            <SectionHead id="track-title" eyebrow="Track record" title="Work we've delivered." />
            {stats.length > 0 && <StatsBand stats={stats} />}
            <FormatGallery items={work} label="Edits by format" />
          </div>
        </section>
      )}

      <section className="sec" aria-labelledby="send-title">
        <div className="w">
          <SectionHead
            id="send-title"
            eyebrow="How it works"
            title="Send. Edit. Done."
            aside={
              <p className="lede">
                Use the tools you already use. Everything else runs through one contact and one
                folder.
              </p>
            }
          />
          <Steps steps={STEPS} snap />
        </div>
      </section>

      <section className="sec alt" aria-labelledby="dashboard-title">
        <div className="w">
          <SectionHead
            id="dashboard-title"
            eyebrow="Your client dashboard"
            title="Every batch in one place."
            aside={
              <p className="lede">
                Upload raw files, follow each batch, download deliveries and ask for revisions.
              </p>
            }
          />
          <DashboardShowcase features={SHOWCASE.post} photos={placedShowcase(showcase, allMedia)} />
        </div>
      </section>

      <section className="sec" aria-label="Questions">
        <div className="w">
          <FAQ title="Editing FAQ." faqs={faqs} />
        </div>
      </section>

      <FreeTestSection alt />

      <CTABand
        title="Try us on one project."
        text="Free test edit. No contract. Your style, matched."
        actions={
          <>
            <ButtonLink href="#free-test">Book a free test</ButtonLink>
            <ButtonLink href="#before-after" variant="ghost">
              See our work
            </ButtonLink>
          </>
        }
      />
    </>
  );
}
