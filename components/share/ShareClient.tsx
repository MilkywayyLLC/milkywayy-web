"use client";

/* eslint-disable @next/next/no-img-element -- media is pre-sized WebP on R2 (signed URLs), not next/image */
import { useEffect, useRef, useState } from "react";
import { HERO_SIZES, heroSrcSet, type GalleryPhoto } from "@/lib/share-media";

/**
 * The few interactive bits of a public share page, kept small so the page stays fast: the view
 * count, WhatsApp/Call taps, the full-screen gallery, the long-form video (loaded on tap) and
 * "Report this page". Counting goes to /api/share/hit, which drops bots.
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
 * Hero + swipe strip (rendered on the server) open a full-screen viewer. The viewer only loads
 * the large WebPs when it opens.
 */
export function Gallery({ photos, title }: { photos: GalleryPhoto[]; title: string }) {
  const [open, setOpen] = useState<number | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState(0);
  // The strip's thumbnails wait until the page has loaded, so the hero photo has the line to
  // itself (it's what people see first, and what page speed is measured on).
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const go = () =>
      "requestIdleCallback" in window
        ? requestIdleCallback(() => setReady(true), { timeout: 1500 })
        : setTimeout(() => setReady(true), 200);
    if (document.readyState === "complete") go();
    else addEventListener("load", go, { once: true });
    return () => removeEventListener("load", go);
  }, []);

  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (open == null) {
      if (d.open) d.close();
      return;
    }
    if (!d.open) d.showModal();
    const t = track.current;
    if (t) t.scrollTo({ left: open * t.clientWidth, behavior: "instant" as ScrollBehavior });
  }, [open]);
  const show = (i: number) => {
    setAt(i);
    setOpen(i);
  };

  const [hero, ...rest] = photos;
  return (
    <>
      <button
        type="button"
        className="sh-hero"
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
        <span className="sh-count">1 / {photos.length} · View all</span>
      </button>
      {rest.length > 0 && (
        <div className="sh-strip" aria-label="More photos">
          {rest.map((p, i) => (
            <button
              key={i}
              type="button"
              onClick={() => show(i + 1)}
              aria-label={`Photo ${i + 2} of ${photos.length}`}
            >
              {ready && <img src={p.small} alt="" loading="lazy" decoding="async" />}
            </button>
          ))}
        </div>
      )}
      <dialog
        ref={dialog}
        className="sh-viewer"
        aria-label={`${title}: photos`}
        onClose={() => setOpen(null)}
      >
        {open != null && (
          <>
            <div
              ref={track}
              className="sh-viewer-track"
              onScroll={(e) => {
                const t = e.currentTarget;
                setAt(Math.round(t.scrollLeft / Math.max(1, t.clientWidth)));
              }}
            >
              {photos.map((p, i) => (
                <figure key={i}>
                  <img
                    src={p.large}
                    alt={`Photo ${i + 1} of ${photos.length}`}
                    loading={Math.abs(i - open) <= 1 ? "eager" : "lazy"}
                    decoding="async"
                  />
                </figure>
              ))}
            </div>
            <div className="sh-viewer-bar">
              <span>
                {at + 1} / {photos.length}
              </span>
              <span className="sh-viewer-nav">
                <button
                  type="button"
                  aria-label="Previous photo"
                  disabled={at === 0}
                  onClick={() =>
                    track.current?.scrollBy({
                      left: -track.current.clientWidth,
                      behavior: "smooth",
                    })
                  }
                >
                  ←
                </button>
                <button
                  type="button"
                  aria-label="Next photo"
                  disabled={at >= photos.length - 1}
                  onClick={() =>
                    track.current?.scrollBy({ left: track.current.clientWidth, behavior: "smooth" })
                  }
                >
                  →
                </button>
                <button type="button" onClick={() => setOpen(null)}>
                  Close
                </button>
              </span>
            </div>
          </>
        )}
      </dialog>
    </>
  );
}

/** YouTube/Vimeo: a play button until tapped, so nothing from them loads with the page. */
export function VideoFacade({ src, title }: { src: string; title: string }) {
  const [on, setOn] = useState(false);
  return on ? (
    <div className="sh-embed">
      <iframe
        src={src}
        title={`${title}: video`}
        allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
        allowFullScreen
      />
    </div>
  ) : (
    <button type="button" className="sh-embed sh-embed-off" onClick={() => setOn(true)}>
      <span className="sh-play" aria-hidden="true">
        ▶
      </span>
      <b>Watch the video tour</b>
    </button>
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
