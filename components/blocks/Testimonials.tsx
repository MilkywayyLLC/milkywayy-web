"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Review } from "@/content/types";
import { SampleLabel } from "@/components/ui/SampleLabel";

/** With this many reviews or more, they drift by in a slow loop; fewer sit in a static row. */
export const MARQUEE_MIN = 6;

/** Google's "G" mark (brand colours, as Google shows it). */
function GoogleG({ size = 18 }: { size?: number }) {
  return (
    <svg viewBox="0 0 48 48" width={size} height={size} aria-hidden="true" className="g-mark">
      <path
        fill="#FFC107"
        d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"
      />
      <path
        fill="#FF3D00"
        d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"
      />
    </svg>
  );
}

function Stars({ n = 5 }: { n?: number }) {
  return (
    <span className="stars" role="img" aria-label={`${n} out of 5 stars`}>
      {[0, 1, 2, 3, 4].map((i) => (
        <svg
          key={i}
          viewBox="0 0 20 20"
          width="14"
          height="14"
          aria-hidden="true"
          data-on={i < n ? "" : undefined}
        >
          <path d="M10 1.6l2.6 5.3 5.8.8-4.2 4.1 1 5.8L10 14.9l-5.2 2.7 1-5.8-4.2-4.1 5.8-.8z" />
        </svg>
      ))}
    </span>
  );
}

const initials = (s: string) =>
  s
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");

/** Auto-scroll pace: one full set of cards per this many ms. */
const LOOP_MS = 45000;
/** Idle time after the last interaction before auto-scroll resumes. */
const RESUME_MS = 6000;

/**
 * Review cards (13 Oct 2026). Every card is the same size; the review is clamped to 4 lines with
 * "More", which opens the full text inside the card (it scrolls there). From 6 reviews: a
 * horizontal scroll row (snap, hidden scrollbar) holding the list twice, auto-scrolled slowly by
 * requestAnimationFrame on scrollLeft and wrapped by one set's width for a seamless loop. Any
 * interaction (pointer, touch, wheel/trackpad, drag, keyboard, More) stops it and the row scrolls
 * freely (mouse drag too); it resumes after 6s idle with nothing open. Keeps moving on hover;
 * pauses off-screen and in a hidden tab; reduced motion: manual only. Shows the "sample" label
 * while any review is a placeholder. Google rating above the heading (`head`), G mark, stars, an
 * initials avatar on each card, and "View all on Google" when the admin has set the link.
 */
export function Testimonials({
  reviews,
  head,
  google,
}: {
  reviews: Review[];
  /** The section heading; the rating line sits above it. */
  head?: ReactNode;
  google?: { value: number; url?: string };
}) {
  const mqRef = useRef<HTMLDivElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const [long, setLong] = useState<Set<string>>(new Set()); // reviews longer than 4 lines
  const [open, setOpen] = useState<string | null>(null); // card key opened with More
  const [touched, setTouched] = useState(0); // bumps on every interaction
  const [idle, setIdle] = useState(true); // no interaction for RESUME_MS
  const [inView, setInView] = useState(false);
  const drag = useRef<{ x: number; left: number } | null>(null);
  const marquee = reviews.length >= MARQUEE_MIN;

  const interact = () => {
    setIdle(false);
    setTouched((t) => t + 1);
  };

  useEffect(() => {
    if (idle) return;
    const t = setTimeout(() => setIdle(true), RESUME_MS);
    return () => clearTimeout(t);
  }, [idle, touched]);

  useEffect(() => {
    const el = mqRef.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setInView(e.isIntersecting));
    io.observe(el);
    return () => io.disconnect();
  }, [marquee]);

  // The loop: one set's width is the wrap point, both for auto-scroll and manual scrolling.
  const setWidth = () => mqRef.current?.querySelector<HTMLElement>(".mq-set")?.offsetWidth ?? 0;
  const wrap = (el: HTMLElement) => {
    const w = setWidth();
    if (!w || "auto" in el.dataset) return; // auto-scroll wraps its own position
    if (el.scrollLeft >= w) el.scrollLeft -= w;
    else if (el.scrollLeft <= 0) el.scrollLeft += w;
  };

  const running = marquee && inView && idle && !open;
  useEffect(() => {
    const el = mqRef.current;
    if (!running || !el || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0;
    let last = 0;
    let pos = el.scrollLeft; // fractional position (scrollLeft rounds)
    el.dataset.auto = "";
    const step = (now: number) => {
      raf = requestAnimationFrame(step);
      if (document.hidden) return void (last = 0);
      const dt = last ? Math.min(now - last, 50) : 0;
      last = now;
      const w = setWidth();
      if (!w) return;
      pos += (dt * w) / LOOP_MS;
      if (pos >= w) pos -= w;
      el.scrollLeft = pos;
    };
    raf = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(raf);
      delete el.dataset.auto;
    };
  }, [running]);

  // Which reviews overflow the clamp (re-measured when the cards resize).
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const measure = () => {
      const next = new Set<string>();
      el.querySelectorAll<HTMLElement>(".q-text").forEach((t) => {
        const id = t.dataset.id;
        if (id && (t.closest(".q.open") || t.scrollHeight > t.clientHeight + 1)) next.add(id);
      });
      setLong((prev) =>
        prev.size === next.size && [...next].every((x) => prev.has(x)) ? prev : next,
      );
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [reviews, open]);

  if (!reviews.length) return null;
  const hasSample = reviews.some((r) => r.sample);

  const card = (r: Review, copy = false) => {
    const key = `${r.id}:${copy ? 1 : 0}`;
    const isOpen = open === key;
    return (
      <figure className={isOpen ? "q open" : "q"} key={key}>
        <GoogleG />
        <div className="q-body">
          <blockquote className="q-text" data-id={r.id} tabIndex={isOpen && !copy ? 0 : undefined}>
            “{r.text}”
          </blockquote>
          {long.has(r.id) && (
            <button
              type="button"
              className="q-more"
              aria-expanded={isOpen}
              tabIndex={copy ? -1 : undefined}
              onClick={(e) => {
                e.stopPropagation();
                interact();
                setOpen(isOpen ? null : key);
              }}
            >
              {isOpen ? "Less" : "More"}
            </button>
          )}
        </div>
        <Stars n={r.rating} />
        <figcaption className="q-who">
          <span className="q-av" aria-hidden="true">
            {initials(r.name || r.company || r.role)}
          </span>
          <span className="q-id">
            <b>{r.name || r.role}</b>
            <span>{(r.name ? [r.role, r.company] : [r.company]).filter(Boolean).join(" · ")}</span>
          </span>
        </figcaption>
      </figure>
    );
  };

  return (
    <div className="stack" ref={root}>
      {(google || head || marquee) && (
        <div className="rv-head">
          <div className="rv-title">
            {google && (
              <div className="rv-rating">
                <GoogleG size={20} />
                <b>{google.value.toFixed(1)}</b>
                <Stars n={Math.round(google.value)} />
              </div>
            )}
            {head}
          </div>
        </div>
      )}
      {hasSample && <SampleLabel>Sample text · replace with real Google reviews</SampleLabel>}
      {marquee ? (
        <div
          ref={mqRef}
          className="mq"
          role="region"
          aria-label="Client reviews"
          tabIndex={0}
          onScroll={(e) => wrap(e.currentTarget)}
          onPointerDown={(e) => {
            interact();
            if (e.pointerType !== "mouse" || (e.target as HTMLElement).closest("button, a")) return;
            drag.current = { x: e.clientX, left: e.currentTarget.scrollLeft };
            e.currentTarget.dataset.drag = "";
          }}
          onPointerMove={(e) => {
            if (!drag.current) return;
            e.currentTarget.scrollLeft = drag.current.left - (e.clientX - drag.current.x);
          }}
          onPointerUp={(e) => {
            drag.current = null;
            delete e.currentTarget.dataset.drag;
          }}
          onPointerLeave={(e) => {
            drag.current = null;
            delete e.currentTarget.dataset.drag;
          }}
          onTouchStart={interact}
          onWheel={interact}
          onKeyDown={interact}
        >
          <div className="mq-track">
            <div className="mq-set">{reviews.map((r) => card(r))}</div>
            <div className="mq-set mq-copy" aria-hidden="true">
              {reviews.map((r) => card(r, true))}
            </div>
          </div>
        </div>
      ) : (
        <div className="quotes">{reviews.map((r) => card(r))}</div>
      )}
      {google?.url && (
        <a className="rv-all" href={google.url} target="_blank" rel="noopener noreferrer">
          View all on Google ↗
        </a>
      )}
    </div>
  );
}
