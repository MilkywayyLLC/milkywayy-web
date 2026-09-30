import { AppLink as Link } from "@/components/ui/AppLink";
import type { Media } from "@/content/types";
import { ViewfinderFrame } from "@/components/media/ViewfinderFrame";

export interface ServiceCard {
  kicker: string;
  title: string;
  text: string;
  price: string; // "From $0.80 / HDR photo" or "White-label"
  cta: string;
  href: string;
  media: Media;
  tag?: string;
  play?: boolean;
  clean?: boolean;
}

/** Four service cards (Post-production "Anything on your plate."). */
export function ServiceCards4({ cards }: { cards: ServiceCard[] }) {
  return (
    <div className="svc4">
      {cards.map((c) => (
        <article className="s3" key={c.kicker}>
          <ViewfinderFrame
            media={c.media}
            small
            corners={false}
            clean={c.clean}
            tag={c.tag}
            play={c.play ? "icon" : undefined}
            sizes="(max-width: 620px) 100vw, (max-width: 1080px) 50vw, 25vw"
          />
          <div className="bd">
            <span className="k">{c.kicker}</span>
            <h3 className="d h3">{c.title}</h3>
            <p>{c.text}</p>
            <div className="ft">
              <span>{c.price}</span>
              <Link className="lnk" href={c.href}>
                {c.cta} →
              </Link>
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}
