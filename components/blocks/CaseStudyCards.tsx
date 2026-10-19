import { AppLink as Link } from "@/components/ui/AppLink";
import { MediaFrame } from "@/components/media/MediaFrame";
import type { CaseStudy } from "@/content/types";

/** Case study cards (Work page, related work). */
export function CaseStudyCards({ items }: { items: CaseStudy[] }) {
  if (!items.length) return null;
  return (
    <div className="cs-cards">
      {items.map((c) => (
        <article className="s3" key={c.slug}>
          <MediaFrame
            media={c.cover}
            kind="case-cover"
            small
            corners={false}
            tag={c.sample ? "Sample" : undefined}
            sizes="(max-width: 760px) 100vw, 50vw"
          />
          <div className="bd">
            <span className="k">{c.client}</span>
            <h3 className="d h3">{c.title}</h3>
            <p>{c.summary}</p>
            <div className="ft">
              <span />
              <Link className="lnk" href={`/work/${c.slug}`}>
                Read the case study →
              </Link>
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}
