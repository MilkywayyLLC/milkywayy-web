/* eslint-disable @next/next/no-img-element -- media is pre-sized WebP on R2 (signed URLs), not next/image */
import type { Metadata } from "next";
import { cache } from "react";
import { ReportPage, TrackView } from "@/components/share/ShareClient";
import { Icon } from "@/components/portal/Icon";
import {
  Brand,
  Byline,
  Contacts,
  Facts,
  requestOrigin,
  Unavailable,
} from "@/components/share/ShareParts";
import { pageMediaUrl } from "@/lib/r2";
import { price, sharePage } from "@/lib/share";

type Props = { params: Promise<{ slug: string }> };

const load = cache((slug: string) => sharePage("c", slug));

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const d = await load(slug);
  if (d.state !== "live") return { title: { absolute: "Collection not available · Milkywayy" } };
  const c = d.collection;
  const origin = await requestOrigin();
  const n = d.listings.length;
  const description =
    c.note?.slice(0, 160) ?? `${n} home${n === 1 ? "" : "s"}, with photos, video and prices.`;
  const image = `${origin}/c/${c.slug}/og.jpg`;
  return {
    title: { absolute: c.title },
    description,
    openGraph: {
      type: "website",
      url: `${origin}/c/${c.slug}`,
      title: c.title,
      description,
      siteName: d.brand?.name ?? "Milkywayy",
      images: [{ url: image, width: 1200, alt: c.title }],
    },
    twitter: { card: "summary_large_image", title: c.title, description, images: [image] },
  };
}

/** Public collection (§6.3): several listings on one link, picked by the agent. */
export default async function CollectionPage({ params }: Props) {
  const { slug } = await params;
  const d = await load(slug);
  if (d.state !== "live" || d.listings.length === 0) return <Unavailable kind="c" />;

  const { collection: c, contacts, brand } = d;
  const origin = await requestOrigin();
  const by = contacts[0]?.name;

  return (
    <div className="sh" data-tone="auto">
      <Brand brand={brand} />
      <main id="main" className="sh-page sh-wide">
        <div className="sh-top sh-ctop">
          {by && (
            <span className="sh-eb">
              Picked by {by}
              {brand?.name ? ` · ${brand.name}` : ""}
            </span>
          )}
          <h1 className="sh-h1">{c.title}</h1>
          {c.note && <p className="sh-desc">{c.note}</p>}
        </div>
        <div className="sh-cols">
          <div className="sh-main">
            <div className="sh-homes">
              {d.listings.map((h, i) => {
                const src = pageMediaUrl(h.photo?.thumb ?? h.photo?.web ?? h.photo?.key);
                return (
                  <a key={h.slug} href={`/l/${h.slug}`} className="sh-card sh-home">
                    <span className="sh-home-img">
                      {src ? (
                        <img
                          src={src}
                          alt=""
                          {...(i === 0
                            ? { fetchPriority: "high" as const }
                            : { loading: "lazy" as const })}
                          decoding="async"
                        />
                      ) : (
                        <span className="sh-hero-empty" />
                      )}
                    </span>
                    <span className="sh-home-text">
                      <span className="sh-price sh-price-s">
                        {price(h.price, h.currency, h.purpose)}
                      </span>
                      <b>{h.title}</b>
                      {h.location && (
                        <span className="sh-loc">
                          <Icon name="pin" size={14} /> {h.location}
                        </span>
                      )}
                      <Facts l={h} />
                    </span>
                  </a>
                );
              })}
            </div>
          </div>
          <aside className="sh-side">
            <Contacts
              kind="c"
              slug={c.slug}
              title={c.title}
              url={`${origin}/c/${c.slug}`}
              contacts={contacts}
              brand={brand}
              heading="Ask about these homes"
            />
          </aside>
        </div>
        <ReportPage kind="c" slug={c.slug} />
      </main>
      <Byline />
      <TrackView kind="c" slug={c.slug} />
    </div>
  );
}
