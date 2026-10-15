import { AppLink as Link } from "@/components/ui/AppLink";
import type { ReactNode } from "react";
import type { Media } from "@/content/types";
import { MediaFrame } from "@/components/media/MediaFrame";
import { MediaOpen } from "@/components/media/MediaOpen";
import { kindOf, type MediaKind } from "@/lib/media-config";
import type { Shown } from "@/lib/playable";

/** The one media item a row shows, at its format's ratio. */
export type RowMedia = { media: Media; kind: MediaKind; title?: string; play?: Shown["play"] };

export const rowMedia = (i: Shown | undefined): RowMedia | undefined =>
  i && { media: i.media, kind: kindOf(i), title: i.title, play: i.play };

const SIZES: Partial<Record<MediaKind, string>> = {
  reel: "(max-width: 860px) 70vw, 320px",
  "ai-avatar": "(max-width: 860px) 70vw, 320px",
};

/**
 * Full-width service rows (Home "Three services. One studio.", Post-production "Anything on your
 * plate."): copy, a price line and ONE media item at its own format's ratio (photo 3:2, reel and
 * AI avatar 9:16, long-form 16:9). Rows alternate the media left and right (`flip`); on phones
 * the media sits on top. The media plays in place (shared player); only the copy links to the page.
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
  media?: RowMedia;
  flip?: boolean;
}) {
  return (
    <div className={flip ? "door flip" : "door"}>
      <Link className="door-copy" href={href}>
        <span className="k">{kicker}</span>
        <h3 className="d h3">{title}</h3>
        <p>{text}</p>
        <span className="price">{price}</span>
        <span className="lnk">{cta} →</span>
      </Link>
      {media && (
        <div className={`door-media f-${media.kind}`}>
          <MediaFrame
            media={media.media}
            kind={media.kind}
            small
            corners={false}
            clean={media.kind === "ai-avatar" ? (media.media.bright ?? true) : undefined}
            title={media.title}
            sizes={SIZES[media.kind] ?? "(max-width: 860px) 100vw, 50vw"}
          >
            {media.play && <MediaOpen play={media.play} />}
          </MediaFrame>
        </div>
      )}
    </div>
  );
}
