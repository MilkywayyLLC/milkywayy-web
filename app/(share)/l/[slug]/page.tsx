/* eslint-disable @next/next/no-img-element -- media is pre-sized WebP on R2 (signed URLs), not next/image */
import type { Metadata } from "next";
import { cache } from "react";
import { preconnect, preload } from "react-dom";
import { Gallery, ReportPage, TrackView, VideoFacade } from "@/components/share/ShareClient";
import { Brand, Byline, Contacts, requestOrigin, Unavailable } from "@/components/share/ShareParts";
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

/** Public listing page (§6.2): photos, video, 360, price and facts, the agent, Milkywayy's byline. */
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
  const reel = d.reel ? pageMediaUrl(d.reel.web) : null;
  const poster = d.reel ? pageMediaUrl(d.reel.poster) : null;
  const video = embedUrl(l.video_url);
  const qr = pageMediaUrl(l.permit_qr);
  const boxes = facts(l);

  return (
    <div className="sh" data-tone="light">
      <main id="main" className="sh-page">
        <Brand brand={brand} />
        {photos.length > 0 ? (
          <Gallery photos={photos} title={l.title} />
        ) : (
          <div className="sh-hero sh-hero-empty" aria-hidden="true" />
        )}
        <div className="sh-body">
          <div className="sh-top">
            <span className="sh-eb">
              {[PURPOSE_LABEL[l.purpose], l.location].filter(Boolean).join(" · ")}
            </span>
            <p className="sh-price">{price(l.price, l.currency, l.purpose)}</p>
            <h1 className="sh-h1">{l.title}</h1>
            {l.property_type && <span className="sh-muted">{l.property_type}</span>}
          </div>
          {boxes.length > 0 && (
            <ul className="sh-facts" aria-label="Key facts">
              {boxes.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
          )}

          {(reel || video || l.tour_url) && (
            <div className="sh-media">
              {reel && (
                <video
                  className="sh-reel"
                  src={reel}
                  poster={poster ?? undefined}
                  controls
                  playsInline
                  preload="none"
                  aria-label={`${l.title}: video`}
                />
              )}
              {video && <VideoFacade src={video} title={l.title} />}
              {l.tour_url && (
                <a
                  className="sh-card sh-tour"
                  href={l.tour_url}
                  target="_blank"
                  rel="noopener nofollow"
                >
                  <b className="sh-h2">360° tour</b>
                  <span className="sh-muted">Walk through every room</span>
                  <span className="btn btn-g btn-s">Open tour</span>
                </a>
              )}
            </div>
          )}

          {l.description && <p className="sh-desc">{l.description}</p>}
          {l.highlights.length > 0 && (
            <ul className="sh-chips" aria-label="Highlights">
              {l.highlights.map((h) => (
                <li key={h}>{h}</li>
              ))}
            </ul>
          )}

          {l.permit_no && (
            <section className="sh-card sh-permit" aria-label="DLD advertising permit">
              <div>
                <span className="sh-eb">DLD permit</span>
                <b className="sh-mono">{l.permit_no}</b>
              </div>
              {qr && <img src={qr} alt="Permit QR code" width={88} height={88} loading="lazy" />}
            </section>
          )}

          <Contacts
            kind="l"
            slug={l.slug}
            title={l.title}
            url={url}
            contacts={contacts}
            brand={brand}
            heading="Ask about this home"
          />
          <ReportPage kind="l" slug={l.slug} />
        </div>
      </main>
      <Byline />
      <TrackView kind="l" slug={l.slug} />
    </div>
  );
}
