import Link from "next/link";
import type { ReactNode } from "react";
import type { PortfolioItem } from "@/content/types";
import { ViewfinderFrame } from "@/components/media/ViewfinderFrame";

/** Home "doors": one row per service with copy, a price line and three thumbnails. */
export function ServiceRow({
  kicker,
  title,
  text,
  price,
  cta,
  href,
  media,
}: {
  kicker: string;
  title: string;
  text: string;
  price: ReactNode;
  cta: string;
  href: string;
  media: PortfolioItem[];
}) {
  return (
    <Link className="door" href={href}>
      <div className="door-copy">
        <span className="k">{kicker}</span>
        <h3 className="d h3">{title}</h3>
        <p>{text}</p>
        <span className="price">{price}</span>
        <span className="lnk">{cta} →</span>
      </div>
      <div className="door-media">
        {media.slice(0, 3).map((m, i) => (
          <ViewfinderFrame
            key={m.id}
            media={m.media}
            small
            corners={false}
            clean={m.category === "ai-avatar"}
            tag={i === 0 ? m.tag : undefined}
            play={m.format === "reel" && i > 0 ? "icon" : undefined}
            sizes="(max-width: 860px) 33vw, 20vw"
          />
        ))}
      </div>
    </Link>
  );
}
