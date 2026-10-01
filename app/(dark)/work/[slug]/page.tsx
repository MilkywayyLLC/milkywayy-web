import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CTABand } from "@/components/blocks/CTABand";
import { ViewfinderFrame } from "@/components/media/ViewfinderFrame";
import { HeroTitle } from "@/components/type/HeroTitle";
import { ButtonLink } from "@/components/ui/Button";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { SampleLabel } from "@/components/ui/SampleLabel";
import { SectionHead } from "@/components/ui/Section";
import { getCaseStudies, getCaseStudy, getPortfolio } from "@/lib/data";
import { pageWhatsappLink } from "@/lib/whatsapp";
import { build } from "@/lib/seo/meta";
import { PageLd } from "@/components/seo/JsonLd";

export async function generateStaticParams() {
  return (await getCaseStudies()).map((c) => ({ slug: c.slug }));
}

export async function generateMetadata({ params }: PageProps<"/work/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const cs = await getCaseStudy(slug);
  if (!cs) return {};
  return build({
    title: `${cs.title} | Work | Milkywayy`,
    description: `${cs.summary} A Milkywayy case study.`,
    path: `/work/${cs.slug}`,
    image: `/og/work/${cs.slug}`,
  });
}

/** Split a title into two balanced lines for the two-line hero rule (guide §4.3). */
function twoLines(title: string): [string, string] {
  const words = title.split(" ");
  let best: [string, string] = [title, ""];
  let diff = Infinity;
  for (let i = 1; i < words.length; i++) {
    const a = words.slice(0, i).join(" ");
    const b = words.slice(i).join(" ");
    const d = Math.abs(a.length - b.length);
    if (d < diff) {
      diff = d;
      best = [a, b];
    }
  }
  return best;
}

/** Case study (guide §6.7): client + brief → what we did → media → results → quote → related. */
export default async function CaseStudyPage({ params }: PageProps<"/work/[slug]">) {
  const { slug } = await params;
  const cs = await getCaseStudy(slug);
  if (!cs) notFound();
  const related = (await getPortfolio("work")).filter((p) => cs.related.includes(p.id));
  const [l1, l2] = cs.heroLines ?? twoLines(cs.title);
  const whatsapp = pageWhatsappLink("Work");

  return (
    <>
      <PageLd page="work" extra={{ name: cs.title, path: `/work/${cs.slug}` }} />
      <div className="w">
        <section className="p-hero p-hero-short" aria-labelledby="cs-title">
          <div className="stack">
            <Eyebrow rec>Case study · {cs.client}</Eyebrow>
            <HeroTitle id="cs-title" line1={l1} line2={l2} />
            {cs.sample && (
              <SampleLabel>Sample case study · replace with a real project</SampleLabel>
            )}
          </div>
          <ViewfinderFrame
            media={cs.cover}
            aspect="16/10"
            priority
            sizes="(max-width: 900px) 100vw, 42vw"
          />
        </section>
      </div>

      <section className="sec alt" aria-labelledby="brief-title">
        <div className="w cs-body">
          <div className="stack">
            <span className="eb">The brief</span>
            <h2 className="d h3" id="brief-title">
              {cs.client}
            </h2>
            <p>{cs.brief}</p>
          </div>
          <div className="stack">
            <span className="eb">What we did</span>
            <ol>
              {cs.whatWeDid.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      {cs.gallery.length > 0 && (
        <section className="sec" aria-label="Project media">
          <div className="w cs-gallery">
            {cs.gallery.map((m, i) => (
              <ViewfinderFrame
                key={i}
                media={m}
                small
                corners={false}
                sizes="(max-width: 760px) 50vw, 33vw"
              />
            ))}
          </div>
        </section>
      )}

      {cs.results.length > 0 && (
        <section className="sec alt" aria-labelledby="results-title">
          <div className="w">
            <SectionHead id="results-title" eyebrow="Results" title="What changed." />
            <div className="stats">
              {cs.results.map((r) => (
                <div className="stat" key={r.label}>
                  <b>{r.value}</b>
                  <span>{r.label}</span>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {cs.quote && (
        <section className="sec" aria-label="Client quote">
          <div className="w founder" style={{ gridTemplateColumns: "1fr" }}>
            <blockquote>“{cs.quote.text}”</blockquote>
            <div className="sig">
              <span>
                <b>{cs.quote.name}</b>
                {cs.quote.role}
              </span>
            </div>
          </div>
        </section>
      )}

      {related.length > 0 && (
        <section className={cs.quote ? "sec alt" : "sec"} aria-labelledby="related-title">
          <div className="w">
            <SectionHead id="related-title" eyebrow="Related work" title="More like this." />
            <div className="cs-gallery">
              {related.slice(0, 3).map((m) => (
                <figure key={m.id} style={{ margin: 0 }} className="stack">
                  <ViewfinderFrame
                    media={m.media}
                    small
                    corners={false}
                    sizes="(max-width: 760px) 50vw, 33vw"
                  />
                  <figcaption className="muted" style={{ fontSize: 14 }}>
                    {m.title}
                  </figcaption>
                </figure>
              ))}
            </div>
          </div>
        </section>
      )}

      <CTABand
        title="Start a similar project."
        text="Tell us what you need; we reply within 15 minutes during working hours."
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
