import { MediaFrame } from "@/components/media/MediaFrame";
import { MediaOpen } from "@/components/media/MediaOpen";
import type { PortfolioFormat } from "@/content/types";
import { kindOf } from "@/lib/media-config";
import type { Shown } from "@/lib/playable";

/**
 * Service-page hero frames (Production, Post-production): three reels side by side at 9:16, or
 * one frame at its own format's ratio (lib/media oneFormat). A frame with something to open is
 * a real control (lightbox or player); otherwise a video shows a plain play icon.
 */
export function HeroMedia({
  items,
  labels,
  trioSizes,
}: {
  items: Shown[];
  labels?: Record<PortfolioFormat, string>;
  trioSizes: string;
}) {
  if (items.length > 1)
    return (
      <div className="trio">
        {items.map((m, i) => (
          <MediaFrame
            key={m.id}
            media={m.media}
            kind="reel"
            small
            play={m.play ? undefined : "icon"}
            tag={labels?.[m.format]}
            priority={i === 1}
            sizes={trioSizes}
          >
            {m.play && <MediaOpen play={m.play} />}
          </MediaFrame>
        ))}
      </div>
    );
  const one = items[0];
  if (!one) return null;
  const kind = kindOf(one);
  return (
    <div className={`hero-one f-${kind}`}>
      <MediaFrame
        media={one.media}
        kind={kind}
        tag={labels?.[one.format]}
        play={one.play || kind === "photo" || kind === "360" ? undefined : "icon"}
        badge={kind === "360" ? "360°" : undefined}
        priority
        sizes="(max-width: 900px) 100vw, 45vw"
      >
        {one.play && <MediaOpen play={one.play} />}
      </MediaFrame>
    </div>
  );
}
