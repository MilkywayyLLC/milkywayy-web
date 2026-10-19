"use client";

/* eslint-disable @next/next/no-img-element -- media is pre-sized WebP on R2 (signed URLs), not next/image */
import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/portal/Icon";

// The zoom viewer and the video/360 modals use Motion: loaded on the first tap.
const ZoomGallery = dynamic(
  () => import("@/components/media/ZoomGallery").then((m) => m.ZoomGallery),
  { ssr: false },
);
const MediaModal = dynamic(() => import("./ShareModal").then((m) => m.ShareModal), {
  ssr: false,
});
import { HERO_SIZES, heroSrcSet, type GalleryPhoto } from "@/lib/share-media";

/**
 * The few interactive bits of a public share page, kept small so the page stays fast: the view
 * count, WhatsApp/Call taps, the gallery and lightbox, the video and 360° modals (loaded on tap),
 * the description's Read more and "Report this page". Counting goes to /api/share/hit, which drops bots.
 */
function hit(kind: "l" | "c", slug: string, event: "view" | "wa" | "call") {
  const body = JSON.stringify({ kind, slug, event });
  try {
    if (navigator.sendBeacon?.("/api/share/hit", new Blob([body], { type: "application/json" })))
      return;
  } catch {}
  void fetch("/api/share/hit", { method: "POST", body, keepalive: true }).catch(() => undefined);
}

/** One view per page per browser tab session (reloads don't count twice). */
export function TrackView({ kind, slug }: { kind: "l" | "c"; slug: string }) {
  useEffect(() => {
    const k = `mw-seen:${kind}:${slug}`;
    try {
      if (sessionStorage.getItem(k)) return;
      sessionStorage.setItem(k, "1");
    } catch {}
    hit(kind, slug, "view");
  }, [kind, slug]);
  return null;
}

/**
 * The sticky bottom bar on tablets and phones (never on desktop): the agent's mini photo and
 * name with Call and WhatsApp, tucked away while the agent card (the same buttons) is on screen.
 */
export function StickyBar({ watch, children }: { watch: string; children: React.ReactNode }) {
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    const el = document.getElementById(watch);
    if (!el || !("IntersectionObserver" in window)) return;
    const io = new IntersectionObserver(([e]) => setHidden(e.isIntersecting));
    io.observe(el);
    return () => io.disconnect();
  }, [watch]);
  return (
    <div className="sh-bar" data-hidden={hidden || undefined} aria-hidden={hidden || undefined}>
      {children}
    </div>
  );
}

/** A WhatsApp or Call link that counts the tap. */
export function TapLink({
  kind,
  slug,
  event,
  href,
  className,
  label,
  children,
}: {
  kind: "l" | "c";
  slug: string;
  event: "wa" | "call";
  href: string;
  className: string;
  label?: string;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      className={className}
      aria-label={label}
      data-tap={event}
      onClick={() => hit(kind, slug, event)}
      {...(event === "wa" ? { target: "_blank", rel: "noopener" } : {})}
    >
      {children}
    </a>
  );
}

/**
 * The listing gallery (site-refine, Oct 2026), Property Finder / Bayut patterns in Milkywayy
 * style. Tablet and desktop: a mosaic (one large photo, a 2×2 grid of the next four, "+N photos"
 * on the last tile). Phones: a full-bleed swipe carousel with a counter. "Video tour" and
 * "360° tour" sit on the photos when that media exists. Anything opens the full-screen lightbox
 * (arrows, keyboard, thumbnail strip, counter), which only loads the large WebPs when it opens.
 */
export function ListingGallery({
  photos,
  title,
  video,
  reel,
  tour,
}: {
  photos: GalleryPhoto[];
  title: string;
  /** YouTube/Vimeo embed URL (autoplays when the modal opens). */
  video: string | null;
  reel: { src: string; poster: string | null } | null;
  tour: string | null;
}) {
  const [open, setOpen] = useState<number | null>(null);
  const [modal, setModal] = useState<"video" | "tour" | null>(null);
  const [slide, setSlide] = useState(0);

  const show = (i: number) => setOpen(i);
  // The photo flies from (and back to) whichever thumbnail of it is showing: mosaic or carousel.
  const origin = (i: number) =>
    [...document.querySelectorAll<HTMLElement>(`[data-photo="${i}"] img`)].find(
      (el) => el.getClientRects().length > 0,
    );
  const hasVideo = !!(video || reel);
  const buttons = (cls: string, short = false) =>
    hasVideo || tour ? (
      <span className={cls}>
        {hasVideo && (
          <button type="button" onClick={() => setModal("video")}>
            <Icon name="play" size={14} /> {short ? "Video" : "Video tour"}
          </button>
        )}
        {tour && (
          <button type="button" onClick={() => setModal("tour")}>
            <Icon name="tour" size={14} /> {short ? "360°" : "360° tour"}
          </button>
        )}
      </span>
    ) : null;

  const [hero, ...rest] = photos;
  const tiles = rest.slice(0, 4);
  const more = photos.length - 1 - tiles.length;
  return (
    <>
      {/* Tablet and desktop: the mosaic. */}
      <div className="sh-mosaic" data-n={tiles.length}>
        <button
          type="button"
          className="sh-mosaic-main"
          data-photo={0}
          onClick={() => show(0)}
          aria-label={`${title}: open the photos (${photos.length})`}
        >
          <img
            src={hero.small}
            srcSet={heroSrcSet(hero)}
            sizes={HERO_SIZES}
            alt={`${title}: main photo`}
            fetchPriority="high"
            decoding="async"
          />
        </button>
        {tiles.length > 0 && (
          <div className="sh-mosaic-grid">
            {tiles.map((p, i) => (
              <button
                key={i}
                type="button"
                data-photo={i + 1}
                onClick={() => show(i + 1)}
                aria-label={`Photo ${i + 2} of ${photos.length}`}
              >
                <img src={p.small} alt="" loading="lazy" decoding="async" />
                {i === tiles.length - 1 && more > 0 && (
                  <span className="sh-more">+{more} photos</span>
                )}
              </button>
            ))}
          </div>
        )}
        {buttons("sh-media-btns")}
        <span className="sh-count sh-count-desk">
          <Icon name="grid" size={14} /> {photos.length} photos
        </span>
      </div>

      {/* Phones: a full-bleed swipe carousel. */}
      <div className="sh-carousel">
        <div
          className="sh-carousel-track"
          onScroll={(e) => {
            const t = e.currentTarget;
            setSlide(Math.round(t.scrollLeft / Math.max(1, t.clientWidth)));
          }}
        >
          {photos.map((p, i) => (
            <button
              key={i}
              type="button"
              data-photo={i}
              onClick={() => show(i)}
              aria-label={i === 0 ? `${title}: open the photos` : `Open photo ${i + 1}`}
            >
              <img src={p.small} alt="" loading={i === 0 ? "eager" : "lazy"} decoding="async" />
            </button>
          ))}
        </div>
        <span className="sh-count" aria-live="polite">
          {slide + 1} / {photos.length}
        </span>
        {buttons("sh-chips-over", true)}
      </div>

      {open != null && (
        <ZoomGallery
          title={title}
          start={open}
          photos={photos.map((p, i) => ({
            src: p.large,
            thumb: p.small,
            alt: `Photo ${i + 1} of ${photos.length}`,
          }))}
          originFor={origin}
          onClose={() => setOpen(null)}
        />
      )}

      {modal === "video" && (
        <MediaModal label="Video tour" onClose={() => setModal(null)}>
          <div className="sh-modal-media">
            {video && (
              <div className="sh-embed">
                <iframe
                  src={video}
                  title={`${title}: video tour`}
                  allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
                  allowFullScreen
                />
              </div>
            )}
            {reel && (
              <video
                className="sh-reel"
                src={reel.src}
                poster={reel.poster ?? undefined}
                controls
                playsInline
                autoPlay={!video}
                aria-label={`${title}: video`}
              />
            )}
          </div>
        </MediaModal>
      )}
      {modal === "tour" && tour && (
        <MediaModal
          label="360° tour"
          onClose={() => setModal(null)}
          aside={
            <a href={tour} target="_blank" rel="noopener nofollow" className="sh-modal-link">
              Open in new tab ↗
            </a>
          }
        >
          <iframe
            className="sh-tour-frame"
            src={tour}
            title={`${title}: 360° tour`}
            allow="fullscreen; xr-spatial-tracking; gyroscope; accelerometer"
            allowFullScreen
          />
        </MediaModal>
      )}
    </>
  );
}

/** The description with its line breaks, clamped to about 8 lines with "Read more". */
export function ReadMore({ text }: { text: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const [long, setLong] = useState(false);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (el) setLong(el.scrollHeight > el.clientHeight + 2);
  }, []);
  return (
    <div className="sh-desc-wrap">
      <p ref={ref} className="sh-desc" data-open={open || undefined}>
        {text}
      </p>
      {(long || open) && (
        <button type="button" className="sh-readmore" onClick={() => setOpen(!open)}>
          {open ? "Show less" : "Read more"}
        </button>
      )}
    </div>
  );
}

/** "Report this page" (§7.4): abuse or a takedown request goes to the admin's Reported filter. */
export function ReportPage({ kind, slug }: { kind: "l" | "c"; slug: string }) {
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");
  return (
    <details className="sh-report">
      <summary>Report this page</summary>
      {state === "done" ? (
        <p role="status">Thanks. Milkywayy will take a look.</p>
      ) : (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const reason = String(new FormData(e.currentTarget).get("reason") ?? "").trim();
            if (reason.length < 3) return;
            setState("sending");
            const r = await fetch("/api/share/report", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ kind, slug, reason }),
            }).catch(() => null);
            setState(r?.ok ? "done" : "error");
          }}
        >
          <label htmlFor="sh-reason">What’s wrong with it?</label>
          <textarea id="sh-reason" name="reason" required minLength={3} maxLength={500} rows={3} />
          <button type="submit" className="btn btn-g btn-s" disabled={state === "sending"}>
            {state === "sending" ? "Sending…" : "Send report"}
          </button>
          {state === "error" && <p role="status">That didn’t send. Try again in a minute.</p>}
        </form>
      )}
    </details>
  );
}
