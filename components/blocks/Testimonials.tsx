import type { Review } from "@/content/types";
import { SampleLabel } from "@/components/ui/SampleLabel";

/** With this many reviews or more, they drift by in a slow loop; fewer sit in a static row. */
export const MARQUEE_MIN = 6;

/**
 * Review cards (site-refine, 3 Oct 2026). From 6 reviews: an infinite slow marquee (~45s loop) of
 * the list twice over, with soft fades at both edges; it pauses on hover and while a card has
 * keyboard focus (the cards are focusable; the second copy is hidden from keyboards and screen
 * readers). Reduced motion: a static row you can scroll. Shows the "sample" label while any review
 * is a placeholder.
 */
export function Testimonials({ reviews }: { reviews: Review[] }) {
  if (!reviews.length) return null;
  const hasSample = reviews.some((r) => r.sample);
  const marquee = reviews.length >= MARQUEE_MIN;
  const card = (r: Review, copy = false) => (
    <figure
      className="q"
      key={copy ? `${r.id}-copy` : r.id}
      tabIndex={marquee && !copy ? 0 : undefined}
    >
      <blockquote>“{r.text}”</blockquote>
      <figcaption>{[r.name, r.role, r.company].filter(Boolean).join(" · ")}</figcaption>
    </figure>
  );
  return (
    <div className="stack">
      {hasSample && <SampleLabel>Sample text · replace with real Google reviews</SampleLabel>}
      {marquee ? (
        <div className="mq" role="region" aria-label="Client reviews">
          <div className="mq-track" style={{ ["--n" as string]: reviews.length }}>
            <div className="mq-set">{reviews.map((r) => card(r))}</div>
            <div className="mq-set mq-copy" aria-hidden="true" inert>
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
