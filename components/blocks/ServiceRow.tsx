import { AppLink as Link } from "@/components/ui/AppLink";
import type { ReactNode } from "react";
import type { PortfolioItem } from "@/content/types";
import { ViewfinderFrame } from "@/components/media/ViewfinderFrame";

/**
 * Home "doors" (site-refine, 3 Oct 2026): one row per service with copy, a price line and ONE
 * media item at its own format's ratio (photo 3:2, reel 9:16, long-form 16:9). Rows alternate
 * the media left and right (`flip`).
 */
export function ServiceRow({
  kicker,
  title,
  text,
  price,
  cta,
  href,
  media,
  flip,
}: {
  kicker: string;
  title: string;
  text: string;
  price: ReactNode;
  cta: string;
  href: string;
  media: PortfolioItem[];
  flip?: boolean;
}) {
  const m = media[0];
  return (
    <Link className={flip ? "door flip" : "door"} href={href}>
      <div className="door-copy">
        <span className="k">{kicker}</span>
        <h3 className="d h3">{title}</h3>
        <p>{text}</p>
        <span className="price">{price}</span>
        <span className="lnk">{cta} →</span>
      </div>
      {m && (
        <div className={`door-media f-${m.format}`}>
          <ViewfinderFrame
            media={m.media}
            format={m.format}
            small
            corners={false}
            clean={m.category === "ai-avatar" ? true : undefined}
            tag={m.tag}
            play={m.format === "reel" || m.format === "long-form" ? "icon" : undefined}
            sizes={
              m.format === "reel"
                ? "(max-width: 860px) 70vw, 320px"
                : "(max-width: 860px) 100vw, 50vw"
            }
          />
        </div>
      )}
    </Link>
  );
}
