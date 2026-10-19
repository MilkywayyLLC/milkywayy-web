import { MediaFrame } from "@/components/media/MediaFrame";
import { MediaOpen } from "@/components/media/MediaOpen";
import type { MediaKind } from "@/lib/media-config";
import type { HeroTemplate } from "@/lib/placements";
import type { Shown } from "@/lib/playable";

/** What each template draws: frames, their ratio, the media kind and the placeholder label. */
const SHAPE: Record<
  Exclude<HeroTemplate, "ba">,
  { n: number; kind: MediaKind; label: string; one?: string }
> = {
  v3: { n: 3, kind: "reel", label: "9:16 video" },
  v1: { n: 1, kind: "reel", label: "9:16 video", one: "f-reel" },
  h1: { n: 1, kind: "long-form", label: "16:9 video", one: "f-long-form" },
  photo: { n: 1, kind: "photo", label: "3:2 photo", one: "f-photo" },
};

/**
 * Service-page hero media (Production, Post-production, Property shoots), drawn from the page's
 * hero template (Admin → Pages): three vertical videos, one vertical, one horizontal or one
 * photo. A frame with something to open is a real control (lightbox or player); otherwise a
 * video shows a plain play icon. Frames still empty show a labelled placeholder in the template's
 * shape, so the right side is never blank.
 */
export function HeroMedia({
  items,
  trioSizes,
  template = "v3",
  label,
}: {
  items: Shown[];
  trioSizes: string;
  template?: Exclude<HeroTemplate, "ba">;
  /** Placeholder wording when it differs from the template's. */
  label?: string;
}) {
  const shape = SHAPE[template];
  const shown = items.slice(0, shape.n);
  const empty = Array.from({ length: shape.n - shown.length }, (_, i) => i);
  const ph = (key: string) => (
    <div key={key} className="fr hero-ph" data-kind={shape.kind} aria-hidden="true">
      <span>{label ?? shape.label}</span>
    </div>
  );

  if (template === "v3")
    return (
      <div className="trio">
        {shown.map((m, i) => (
          <MediaFrame
            key={m.id}
            media={m.media}
            kind="reel"
            small
            corners={false}
            title={m.title}
            priority={i === 1}
            sizes={trioSizes}
          >
            {m.play && <MediaOpen play={m.play} />}
          </MediaFrame>
        ))}
        {empty.map((i) => ph(`ph${i}`))}
      </div>
    );

  const one = shown[0];
  return (
    <div className={`hero-one ${shape.one}`}>
      {one ? (
        <MediaFrame
          media={one.media}
          kind={shape.kind}
          corners={false}
          title={one.title}
          priority
          sizes="(max-width: 900px) 100vw, 45vw"
        >
          {one.play && <MediaOpen play={one.play} />}
        </MediaFrame>
      ) : (
        ph("ph")
      )}
    </div>
  );
}
