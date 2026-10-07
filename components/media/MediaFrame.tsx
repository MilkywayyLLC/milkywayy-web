import Image from "next/image";
import type { CSSProperties, ReactNode } from "react";
import type { Media } from "@/content/types";
import { cx } from "@/lib/cx";
import { MEDIA, type MediaKind } from "@/lib/media-config";

/**
 * Every card, poster, player frame and hero frame on the site (owner, 7 Oct 2026). `kind` sets
 * the ratio from lib/media-config (photo 3:2, reel 9:16, long-form and 360 16:9, …); the image
 * always fills it with object-fit: cover at the focal point saved in the admin. Camera look on
 * top: corner brackets, optional timecode, top-left meta, a bottom tag and a play button
 * (guide §4.5). Shows a placeholder swatch until real media exists. Images load lazily unless
 * `priority` (the hero's LCP image).
 */
export function MediaFrame({
  media,
  kind,
  corners = true,
  timecode,
  topLeft,
  tag,
  tagRight,
  badge,
  play,
  small,
  clean,
  priority,
  sizes = "(max-width: 900px) 100vw, 50vw",
  className,
  style,
  children,
}: {
  media: Media;
  /** The format: sets the ratio. Without it the frame takes its size from the layout. */
  kind?: MediaKind;
  corners?: boolean;
  /** Static text or a <Timecode /> element. */
  timecode?: ReactNode;
  topLeft?: string;
  tag?: string;
  tagRight?: string;
  /** A small label in the top-left corner, e.g. "360°" or "24 photos". */
  badge?: string;
  /** Decorative play icon (a real control comes from MediaOpen / LiteVideo children). */
  play?: "icon";
  small?: boolean;
  /** Bright images: no dark gradient, dark tag text. */
  clean?: boolean;
  priority?: boolean;
  sizes?: string;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
}) {
  const placeholder = !media.src && media.placeholder ? `ph-${media.placeholder}` : undefined;
  const bright = clean ?? media.bright;
  return (
    <div
      className={cx(
        "fr",
        small && "sm",
        bright && "clean",
        corners && "has-corners",
        kind && `k-${kind}`,
        placeholder,
        className,
      )}
      style={{ ...(kind ? { aspectRatio: MEDIA[kind].ratio } : null), ...style }}
      data-kind={kind}
      role={media.src ? undefined : "img"}
      aria-label={media.src ? undefined : media.alt}
    >
      {media.src && (
        <Image
          src={media.src}
          alt={media.alt}
          fill
          sizes={sizes}
          priority={priority}
          style={{ objectFit: "cover", objectPosition: media.focus ?? "50% 50%" }}
        />
      )}
      {corners && (
        <span
          className="corners"
          aria-hidden="true"
          style={bright ? { filter: "invert(1)" } : undefined}
        />
      )}
      {topLeft && <span className="tl">{topLeft}</span>}
      {badge && <span className="fr-badge">{badge}</span>}
      {timecode && (
        <span className="tc" style={bright ? { color: "#111" } : undefined}>
          <i className="rec-dot" aria-hidden="true" />
          {timecode}
        </span>
      )}
      {play === "icon" && <span className="play" aria-hidden="true" />}
      {(tag || tagRight) && (
        <span className="tag">
          <span>{tag}</span>
          {tagRight && <span>{tagRight}</span>}
        </span>
      )}
      {children}
    </div>
  );
}
