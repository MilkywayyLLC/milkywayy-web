"use client";

import { useEffect, useRef, useState } from "react";
import { MediaFrame } from "@/components/media/MediaFrame";
import type { Media } from "@/content/types";
import type { MediaKind } from "@/lib/media-config";

export type CarouselAvatar = {
  id: string;
  name: string;
  /** The industry chip, e.g. "Real estate". */
  industry: string;
  poster: Media;
  /** A hosted file (plays muted on loop in the centre); links show the poster only. */
  src?: string;
};

const STEP_MS = 1200;
/** Designed for exactly five: the centre card and two each side. */
const MAX = 5;

/**
 * "Built for your audience" (12 Oct 2026): a layered carousel of the admin's AI avatar examples.
 * Always exactly five positions (fewer avatars repeat in the loop): the centre card is 9:16 (16px corners) and plays muted on
 * loop; two cards each side sit behind it (scaled 0.86 / 0.72, offset, dimmed, slightly blurred).
 * Advances every 1.2s with a 300ms ease-out, so it reads as moving on its own; pauses off-screen,
 * and only the centre video plays. Phones: centre card plus side peeks,
 * swipeable. Reduced motion: no auto-advance. Also Production's "Recent work" reels (`label`,
 * `noun` and `kind` override the avatar defaults).
 */
export function AvatarCarousel({
  items: all,
  label = "AI avatar examples",
  noun = "avatar",
  kind = "ai-avatar",
}: {
  items: CarouselAvatar[];
  label?: string;
  noun?: string;
  kind?: MediaKind;
}) {
  // Always five positions, symmetric: with fewer avatars the loop repeats them.
  const items = all.length ? Array.from({ length: MAX }, (_, k) => all[k % all.length]) : [];
  const root = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const [inView, setInView] = useState(false);
  const [held, setHeld] = useState(0); // bumps on manual moves, restarting the timer
  const touch = useRef<number | null>(null);
  const n = items.length;

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setInView(e.isIntersecting), { threshold: 0.3 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!inView || n < 2 || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = setInterval(() => setActive((a) => (a + 1) % n), STEP_MS);
    return () => clearInterval(t);
  }, [inView, n, held]);

  const go = (d: number) => {
    setActive((a) => (a + d + n) % n);
    setHeld((h) => h + 1);
  };
  const half = Math.floor(n / 2);

  return (
    <div
      ref={root}
      className="av-car"
      role="region"
      aria-roledescription="carousel"
      aria-label={label}
      onTouchStart={(e) => (touch.current = e.touches[0].clientX)}
      onTouchEnd={(e) => {
        if (touch.current == null) return;
        const dx = e.changedTouches[0].clientX - touch.current;
        touch.current = null;
        if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1);
      }}
    >
      <div className="av-car-stage">
        {items.map((a, i) => {
          // Position relative to the centre, wrapped so the deck loops.
          const off = ((i - active + n + half) % n) - half;
          const centre = off === 0;
          return (
            <div
              key={`${a.id}:${i}`}
              className="av-car-card"
              data-off={Math.max(-3, Math.min(3, off))}
              aria-hidden={!centre}
              onClick={() => !centre && Math.abs(off) <= 2 && go(off)}
            >
              <MediaFrame
                media={a.poster}
                kind={kind}
                small
                corners={false}
                clean
                sizes="(max-width: 760px) 60vw, 300px"
              >
                {centre && a.src && <CentreVideo src={a.src} playing={inView} />}
              </MediaFrame>
              {a.industry && <span className="av-chip">{a.industry}</span>}
            </div>
          );
        })}
      </div>
      <p className="sr" aria-live="polite">
        {items[active]?.name}, {items[active]?.industry}
      </p>
      {n > 1 && (
        <div className="av-car-nav">
          <button type="button" aria-label={`Previous ${noun}`} onClick={() => go(-1)}>
            ←
          </button>
          <button type="button" aria-label={`Next ${noun}`} onClick={() => go(1)}>
            →
          </button>
        </div>
      )}
    </div>
  );
}

function CentreVideo({ src, playing }: { src: string; playing: boolean }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    if (playing) v.play().catch(() => {});
    else v.pause();
  }, [playing]);
  return (
    <video ref={ref} className="av-car-vid" src={src} muted loop playsInline preload="metadata" />
  );
}
