"use client";

import { useEffect, useRef, useState } from "react";
import type { Review } from "@/content/types";
import { SampleLabel } from "@/components/ui/SampleLabel";

/** With this many reviews or more, they drift by in a slow loop; fewer sit in a static row. */
export const MARQUEE_MIN = 6;

/**
 * Review cards (13 Oct 2026). Every card is the same size; the review is clamped to 5 lines with
 * "More", which opens the full text inside the card (it scrolls there). From 6 reviews: an
 * infinite slow marquee (~45s loop) of the list twice over, with soft edges. It keeps moving on
 * hover and pauses only on a click (click again to resume) or while a card is opened with More.
 * Reduced motion: a static row you can scroll. Shows the "sample" label while any review is a
 * placeholder.
 */
export function Testimonials({ reviews }: { reviews: Review[] }) {
  const root = useRef<HTMLDivElement>(null);
  const [long, setLong] = useState<Set<string>>(new Set()); // reviews longer than 5 lines
  const [open, setOpen] = useState<string | null>(null); // card key opened with More
  const [paused, setPaused] = useState(false);

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
  const marquee = reviews.length >= MARQUEE_MIN;

  const card = (r: Review, copy = false) => {
    const key = `${r.id}:${copy ? 1 : 0}`;
    const isOpen = open === key;
    return (
      <figure className={isOpen ? "q open" : "q"} key={key}>
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
                setOpen(isOpen ? null : key);
              }}
            >
              {isOpen ? "Less" : "More"}
            </button>
          )}
        </div>
        <figcaption>{[r.name, r.role, r.company].filter(Boolean).join(" · ")}</figcaption>
      </figure>
    );
  };

  return (
    <div className="stack" ref={root}>
      {hasSample && <SampleLabel>Sample text · replace with real Google reviews</SampleLabel>}
      {marquee ? (
        <div
          className="mq"
          role="region"
          aria-label="Client reviews"
          data-paused={paused || open ? "" : undefined}
          onClick={() => setPaused((p) => !p)}
        >
          <div className="mq-track" style={{ ["--n" as string]: reviews.length }}>
            <div className="mq-set">{reviews.map((r) => card(r))}</div>
            <div className="mq-set mq-copy" aria-hidden="true">
              {reviews.map((r) => card(r, true))}
            </div>
          </div>
        </div>
      ) : (
        <div className="quotes">{reviews.map((r) => card(r))}</div>
      )}
    </div>
  );
}
