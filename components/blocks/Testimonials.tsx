import type { Review } from "@/content/types";
import { SampleLabel } from "@/components/ui/SampleLabel";

/** Review cards. Shows the "sample" label while any review is still a placeholder. */
export function Testimonials({ reviews }: { reviews: Review[] }) {
  if (!reviews.length) return null;
  const hasSample = reviews.some((r) => r.sample);
  return (
    <div className="stack">
      {hasSample && <SampleLabel>Sample text · replace with real Google reviews</SampleLabel>}
      <div className="quotes">
        {reviews.map((r) => (
          <figure className="q" key={r.id}>
            <blockquote>“{r.text}”</blockquote>
            <figcaption>{[r.name, r.role, r.company].filter(Boolean).join(" · ")}</figcaption>
          </figure>
        ))}
      </div>
    </div>
  );
}
