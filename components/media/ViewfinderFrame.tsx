import Image from "next/image";
import type { CSSProperties, ReactNode } from "react";
import type { Media, PortfolioFormat } from "@/content/types";
import { cx } from "@/lib/cx";

/** One ratio per format, site-wide (site-refine, 3 Oct 2026). Images fill it with object-fit: cover. */
export const FORMAT_RATIO: Record<PortfolioFormat, string> = {
  photo: "3/2",
  reel: "9/16",
  "long-form": "16/9",
  "360": "16/9",
};

/**
 * Media wrapper with the camera look: corner brackets, optional timecode (top right), top-left
 * meta, bottom tag and a square play button (guide §4.5). Shows a placeholder swatch until real
 * media exists. Video playback (poster first, player on click) arrives with LiteVideo in Phase 2.
 */
export function ViewfinderFrame({
  media,
  corners = true,
  timecode,
  topLeft,
  tag,
  tagRight,
  play,
  small,
  clean,
  aspect,
  format,
  priority,
  sizes = "(max-width: 900px) 100vw, 50vw",
  className,
  style,
  children,
}: {
  media: Media;
  corners?: boolean;
  /** Static text or a <Timecode /> element. */
  timecode?: ReactNode;
  topLeft?: string;
  tag?: string;
  tagRight?: string;
  /** "button" renders a real control (needs an onClick in a client wrapper); "icon" is decorative. */
  play?: "icon" | "button";
  small?: boolean;
  /** Bright images: no dark gradient, dark tag text. */
  clean?: boolean;
  aspect?: string;
  /** Portfolio format: sets the frame's ratio (photo 3:2, reel 9:16, long-form/360 16:9). */
  format?: PortfolioFormat;
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
        placeholder,
        className,
      )}
      style={{
        ...(aspect || format ? { aspectRatio: aspect ?? FORMAT_RATIO[format!] } : null),
        ...style,
      }}
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
          style={media.focus ? { objectPosition: media.focus } : undefined}
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
