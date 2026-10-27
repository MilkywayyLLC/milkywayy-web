/* eslint-disable @next/next/no-img-element -- media is pre-sized WebP on R2 (signed URLs), not next/image */
import type { Metadata } from "next";
import { cache } from "react";
import { preconnect, preload } from "react-dom";
import { Icon } from "@/components/portal/Icon";
import { ListingGallery, ReadMore, ReportPage, TrackView } from "@/components/share/ShareClient";
import {
  Brand,
  Byline,
  Contacts,
  Facts,
  requestOrigin,
  Unavailable,
} from "@/components/share/ShareParts";
import { pageMediaUrl } from "@/lib/r2";
import { embedUrl, facts, price, PURPOSE_LABEL, sharePage } from "@/lib/share";
import { HERO_SIZES, heroSrcSet } from "@/lib/share-media";

type Props = { params: Promise<{ slug: string }> };

// One database read per request, shared by the metadata and the page.
const load = cache((slug: string) => sharePage("l", slug));

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const d = await load(slug);
  if (d.state !== "live") return { title: { absolute: "Listing not available · Milkywayy" } };
  const l = d.listing;
  const origin = await requestOrigin();
  const description = [price(l.price, l.currency, l.purpose), ...facts(l).slice(0, 3), l.location]
    .filter(Boolean)
    .join(" · ");
  const image = `${origin}/l/${l.slug}/og.jpg`;
  return {
    title: { absolute: l.title },
    description,
    alternates: { canonical: `${origin}/l/${l.slug}` },
    openGraph: {
      type: "website",
      url: `${origin}/l/${l.slug}`,
      title: l.title,
      description,
      siteName: d.brand?.name ?? "Milkywayy",
      images: [{ url: image, width: 1200, alt: l.title }],
    },
    twitter: { card: "summary_large_image", title: l.title, description, images: [image] },
  };
}

/**
 * Public listing page (§6.2; redesigned site-refine, Oct 2026, on Property Finder / Bayut
 * patterns): gallery mosaic with Video / 360° buttons, then price, title, location, key facts,
 * description, amenities and the property information on the left, the sticky agent card on the
 * right. Tablets and phones: one column and a bottom bar with the agent.
 */
export default async function ListingPage({ params }: Props) {
  const { slug } = await params;
  const d = await load(slug);
  if (d.state !== "live") return <Unavailable kind="l" />;

  const { listing: l, contacts, brand } = d;
  const origin = await requestOrigin();
  const url = `${origin}/l/${l.slug}`;
  const photos = d.photos
    .map((p) => {
      const small = pageMediaUrl(p.thumb ?? p.web ?? p.key);
      const large = pageMediaUrl(p.web ?? p.thumb ?? p.key);
      return small && large ? { small, large } : null;
    })
    .filter((p) => p !== null);
  // The hero is the first thing anyone sees: connect to storage and fetch it straight away.
  if (photos[0]) {
    preconnect(new URL(photos[0].small).origin);
    preload(photos[0].small, {
      as: "image",
      fetchPriority: "high",
      imageSrcSet: heroSrcSet(photos[0]),
      imageSizes: HERO_SIZES,
    });
  }
  const reelSrc = d.reel ? pageMediaUrl(d.reel.web) : null;
  const reel = reelSrc
    ? { src: reelSrc, poster: d.reel ? pageMediaUrl(d.reel.poster) : null }
    : null;
  const video = embedUrl(l.video_url);
  const qr = pageMediaUrl(l.permit_qr);
  const date = (iso?: string) =>
    iso
      ? new Date(iso).toLocaleDateString("en-GB", {
          day: "numeric",
          month: "short",
          year: "numeric",
          timeZone: "Asia/Dubai",
        })
      : null;
  const info = (
    [
      ["Type", l.property_type],
      ["Purpose", PURPOSE_LABEL[l.purpose]],
      ["Reference", l.slug.toUpperCase()],
      ["Listed", date(l.listed_at)],
      ["Updated", l.updated_at && l.updated_at !== l.listed_at ? date(l.updated_at) : null],
    ] as [string, string | null][]
  ).filter(([, v]) => v);

  return (
    <div className="sh" data-tone="auto">
      <Brand brand={brand} />
      <main id="main" className="sh-page sh-wide">
        {photos.length > 0 ? (
          <ListingGallery
            photos={photos}
            title={l.title}
            video={video}
            reel={reel}
            tour={l.tour_url}
          />
        ) : (
          <div className="sh-hero-empty" aria-hidden="true" />
        )}
        <div className="sh-cols">
          <div className="sh-main">
            <div className="sh-top">
              <p className="sh-price">{price(l.price, l.currency, l.purpose)}</p>
              <h1 className="sh-h1">{l.title}</h1>
              {l.location && (
                <span className="sh-loc">
                  <Icon name="pin" size={16} /> {l.location}
                </span>
              )}
            </div>
            <Facts l={l} />

            {l.description && (
              <section className="sh-sec" aria-labelledby="sh-about">
                <h2 id="sh-about" className="sh-h2">
                  About this home
                </h2>
                <ReadMore text={l.description} />
              </section>
            )}
            {l.highlights.length > 0 && (
              <section className="sh-sec" aria-labelledby="sh-amen">
                <h2 id="sh-amen" className="sh-h2">
                  Amenities
                </h2>
                <ul className="sh-chips" aria-label="Highlights">
                  {l.highlights.map((h) => (
                    <li key={h}>
                      <Icon name="check" size={14} /> {h}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <section className="sh-sec" aria-labelledby="sh-info">
              <h2 id="sh-info" className="sh-h2">
                Property information
              </h2>
              <table className="sh-info" aria-labelledby="sh-info">
                <tbody>
                  {info.map(([k, v]) => (
                    <tr key={k}>
                      <th scope="row">{k}</th>
                      <td>{v}</td>
                    </tr>
                  ))}
                  {l.permit_no && (
                    <tr>
                      <th scope="row">DLD permit</th>
                      <td aria-label="DLD advertising permit">
                        <span className="sh-permit">
                          <b className="sh-mono">{l.permit_no}</b>
                          {qr && (
                            <img
                              src={qr}
                              alt="Permit QR code"
                              width={72}
                              height={72}
                              loading="lazy"
                            />
                          )}
                        </span>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </section>
          </div>
          <aside className="sh-side">
            <Contacts
              kind="l"
              slug={l.slug}
              title={l.title}
              url={url}
              contacts={contacts}
              brand={brand}
              heading="Ask about this home"
            />
          </aside>
        </div>
        <ReportPage kind="l" slug={l.slug} />
      </main>
      <Byline />
      <TrackView kind="l" slug={l.slug} />
    </div>
  );
}
