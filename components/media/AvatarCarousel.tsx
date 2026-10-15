"use client";

import { useEffect, useRef, useState } from "react";
import { MediaFrame } from "@/components/media/MediaFrame";
import type { Media } from "@/content/types";
import type { MediaKind } from "@/lib/media-config";
import { useSound } from "./sound";
import { VideoControls } from "./VideoControls";

export type CarouselAvatar = {
  id: string;
  name: string;
  /** The industry chip, e.g. "Real estate". */
  industry: string;
  poster: Media;
  /** A hosted file (plays muted in the centre); links show the poster only. */
  src?: string;
};

/** Designed for five: the centre card and two each side. */
const MAX = 5;
const AUTO_MS = { auto: 1200, pick: 3200 };
/** "auto": idle time after a manual move before auto-advance resumes. */
const IDLE_MS = 4000;
/** "pick": idle time after the chosen video ends before auto-advance resumes. */
const ENDED_IDLE_MS = 8000;
const SWIPE_PX = 40;
const WHEEL_PX = 60;

/**
 * Layered carousel (12 Oct 2026): up to five positions, one per item (never repeated); the
 * centre card is 9:16 (16px corners), two each side sit behind it (scaled, offset, dimmed).
 * Move by drag, swipe, horizontal trackpad scroll, arrow keys or a click on a card; no buttons.
 *
 * - `mode="auto"` (AI avatars): advances every 1.2s with a 300ms ease-out and the centre card's
 *   clip plays muted on loop. A manual move pauses it; it resumes after 4s idle.
 * - `mode="pick"` (Production recent work): posters only, slowly advancing. Choosing a card
 *   (click, drag, swipe) stops the auto-advance, centres it and plays its video, with
 *   sound (the shared site-wide sound state) and pause controls. Auto-advance resumes when the section leaves the viewport and comes
 *   back, or 8s after the video ends.
 *
 * Pauses off-screen. Reduced motion: no auto-advance.
 */
export function AvatarCarousel({
  items: all,
  label = "AI avatar examples",
  kind = "ai-avatar",
  mode = "auto",
}: {
  items: CarouselAvatar[];
  label?: string;
  kind?: MediaKind;
  mode?: "auto" | "pick";
}) {
  // Each card is its own item, never a repeat: fewer than five items means fewer cards.
  const items = all.slice(0, MAX);
  const root = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const [inView, setInView] = useState(false);
  const [held, setHeld] = useState(false); // a manual move stopped auto-advance
  const [moved, setMoved] = useState(0); // bumps on each manual move (restarts the idle timer)
  const [ended, setEnded] = useState(false); // the chosen video finished
  const [sounded, setSounded] = useState(false); // "auto": the centre card was clicked, so it plays with sound
  const drag = useRef<{ x: number; dx: number } | null>(null);
  const dragged = useRef(false); // swallow the click that ends a drag
  const wheel = useRef({ acc: 0, lock: 0 });
  const n = items.length;
  const pick = mode === "pick";

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => {
        setInView(e.isIntersecting);
        // "pick": leaving the viewport hands control back to auto-advance.
        if (!e.isIntersecting && pick) setHeld(false);
      },
      { threshold: 0.3 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [pick]);

  // Auto-advance while in view and not held.
  useEffect(() => {
    if (!inView || held || n < 2 || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = setInterval(() => {
      setActive((a) => (a + 1) % n);
      setSounded(false);
    }, AUTO_MS[mode]);
    return () => clearInterval(t);
  }, [inView, held, n, mode]);

  // Resume: "auto" after 4s idle; "pick" 8s after the video ends.
  useEffect(() => {
    const chosen = pick || sounded;
    if (!held || (chosen && !ended)) return;
    const t = setTimeout(() => setHeld(false), chosen ? ENDED_IDLE_MS : IDLE_MS);
    return () => clearTimeout(t);
  }, [held, moved, ended, pick, sounded]);

  // A manual choice: hold auto-advance and (re)start the centre card's video.
  const choose = () => {
    setHeld(true);
    setEnded(false);
    setMoved((m) => m + 1);
  };
  const go = (d: number) => {
    setActive((a) => (a + d + n) % n);
    setSounded(false);
    choose();
  };
  const half = Math.floor(n / 2);
  // "pick" plays only a card the viewer chose; "auto" plays the centre while it advances.
  const play = inView && (pick ? held : true);

  return (
    <div
      ref={root}
      className="av-car"
      role="region"
      aria-roledescription="carousel"
      aria-label={label}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
          e.preventDefault();
          go(e.key === "ArrowRight" ? 1 : -1);
        }
      }}
      onPointerDown={(e) => {
        if ((e.target as HTMLElement).closest(".vc")) return;
        drag.current = { x: e.clientX, dx: 0 };
        dragged.current = false;
      }}
      onPointerMove={(e) => {
        if (drag.current) drag.current.dx = e.clientX - drag.current.x;
      }}
      onPointerUp={() => {
        const dx = drag.current?.dx ?? 0;
        drag.current = null;
        if (Math.abs(dx) > SWIPE_PX) {
          dragged.current = true;
          go(dx < 0 ? 1 : -1);
        }
      }}
      onPointerCancel={() => (drag.current = null)}
      onDragStart={(e) => e.preventDefault()}
      onWheel={(e) => {
        if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
        const w = wheel.current;
        if (Date.now() < w.lock) return;
        w.acc += e.deltaX;
        if (Math.abs(w.acc) > WHEEL_PX) {
          go(w.acc > 0 ? 1 : -1);
          w.acc = 0;
          w.lock = Date.now() + 450;
        }
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
              onClick={() => {
                if (dragged.current) return void (dragged.current = false);
                if (Math.abs(off) > 2) return;
                if (off) go(off);
                else if (pick && (!held || ended)) choose(); // centre card: play it in place
                else if (!pick && !sounded) {
                  // The muted loop becomes a normal player: from the start, with sound.
                  choose();
                  setSounded(true);
                }
              }}
            >
              <MediaFrame
                media={a.poster}
                kind={kind}
                small
                corners={false}
                clean
                sizes="(max-width: 760px) 60vw, 300px"
              >
                {centre && a.src && play && (
                  <CentreVideo
                    key={`${a.id}:${i}:${moved}`}
                    src={a.src}
                    loop={!pick && !sounded}
                    controls={pick || sounded}
                    onEnded={() => setEnded(true)}
                  />
                )}
              </MediaFrame>
              {a.industry && <span className="av-chip">{a.industry}</span>}
            </div>
          );
        })}
      </div>
      <p className="sr" aria-live="polite">
        {items[active]?.name}, {items[active]?.industry}
      </p>
    </div>
  );
}

function CentreVideo({
  src,
  loop,
  controls,
  onEnded,
}: {
  src: string;
  loop: boolean;
  controls: boolean;
  onEnded: () => void;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  // Chosen by a click: plays with the site-wide sound state. The idle auto deck stays muted.
  const sound = useSound();
  const on = useRef(sound.on);
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    v.muted = !(controls && on.current);
    v.play().catch(() => {
      v.muted = true;
      v.play().catch(() => {});
    });
  }, [controls]);
  return (
    <>
      <video
        ref={ref}
        className="av-car-vid"
        src={src}
        muted
        loop={loop}
        playsInline
        preload="metadata"
        onEnded={onEnded}
        onClick={(e) => {
          if (!controls) return;
          e.stopPropagation();
          const v = e.currentTarget;
          if (v.paused) v.play().catch(() => {});
          else v.pause();
        }}
      />
      {controls && <VideoControls video={ref} />}
    </>
  );
}
