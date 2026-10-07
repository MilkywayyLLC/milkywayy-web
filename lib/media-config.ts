import type { Media, PortfolioItem } from "@/content/types";

/**
 * Every piece of media on the site has a fixed format (owner, 7 Oct 2026). This is the one place
 * that says what each format looks like: the site's MediaFrame reads the ratio, the players read
 * what a click opens, and the admin reads the same entries for "Shown at" and "Recommended
 * export", so the admin and the site can't disagree.
 */
export type MediaKind =
  | "photo"
  | "reel"
  | "long-form"
  | "360"
  | "before-after"
  | "ai-avatar"
  | "showreel"
  | "founder"
  | "avatar-hero"
  | "case-cover"
  | "og";

/** What a click on the card opens. */
export type Opens = "lightbox" | "reel" | "video" | "tour" | "slider" | "in-place" | "none";

export interface MediaSpec {
  label: string;
  /** CSS aspect-ratio, e.g. "3 / 2". */
  ratio: string;
  /** For people: "3:2". */
  ratioLabel: string;
  /** Recommended export size in pixels. */
  width: number;
  height: number;
  opens: Opens;
  /** Admin hint for the cover image of this format. */
  coverHint: string;
  /** Recommended video export (formats that carry a video file). */
  video?: { width: number; height: number };
}

export const MEDIA: Record<MediaKind, MediaSpec> = {
  photo: {
    label: "Photo (property set)",
    ratio: "3 / 2",
    ratioLabel: "3:2",
    width: 2400,
    height: 1600,
    opens: "lightbox",
    coverHint: "The starred photo is the card. Landscape photos fit best.",
  },
  reel: {
    label: "Reel",
    ratio: "9 / 16",
    ratioLabel: "9:16",
    width: 1080,
    height: 1920,
    opens: "reel",
    coverHint: "The poster shown before the reel plays. Use a vertical frame from the reel.",
    video: { width: 1080, height: 1920 },
  },
  "long-form": {
    label: "Long-form",
    ratio: "16 / 9",
    ratioLabel: "16:9",
    width: 1920,
    height: 1080,
    opens: "video",
    coverHint: "The poster shown before the video plays. A wide still from the video.",
  },
  "360": {
    label: "360 tour",
    ratio: "16 / 9",
    ratioLabel: "16:9",
    width: 1920,
    height: 1080,
    opens: "tour",
    coverHint: "A wide still of the property. The tour opens when someone taps it.",
  },
  "before-after": {
    label: "Before/after",
    ratio: "3 / 2",
    ratioLabel: "3:2",
    width: 2400,
    height: 1600,
    opens: "slider",
    coverHint: "Export the before and after at exactly the same size and framing.",
  },
  "ai-avatar": {
    label: "AI avatar",
    ratio: "9 / 16",
    ratioLabel: "9:16",
    width: 1080,
    height: 1920,
    opens: "reel",
    coverHint: "A vertical still of the presenter. Keep the face in the top half.",
    video: { width: 1080, height: 1920 },
  },
  showreel: {
    label: "Showreel",
    ratio: "16 / 9",
    ratioLabel: "16:9",
    width: 1920,
    height: 1080,
    opens: "in-place",
    coverHint: "Shown before the showreel plays, and loads first. A wide, bright frame.",
    video: { width: 1920, height: 1080 },
  },
  founder: {
    label: "Founder photo",
    ratio: "4 / 5",
    ratioLabel: "4:5",
    width: 1600,
    height: 2000,
    opens: "none",
    coverHint: "A portrait. Tap your face so every crop keeps it in frame.",
  },
  "avatar-hero": {
    label: "AI avatars hero",
    ratio: "4 / 5",
    ratioLabel: "4:5",
    width: 1600,
    height: 2000,
    opens: "in-place",
    coverHint: "The presenter in a portrait frame. Keep the face in the top half.",
  },
  "case-cover": {
    label: "Case study cover",
    ratio: "16 / 9",
    ratioLabel: "16:9",
    width: 1920,
    height: 1080,
    opens: "none",
    coverHint: "A wide image of the project.",
  },
  og: {
    label: "Link preview",
    ratio: "1200 / 630",
    ratioLabel: "1.91:1",
    width: 1200,
    height: 630,
    opens: "none",
    coverHint: "Shown when the page is shared on WhatsApp, LinkedIn or X.",
  },
};

export const exportSize = (k: MediaKind) => `${MEDIA[k].width}×${MEDIA[k].height}`;

/** The format a portfolio item is shown in: AI avatar work is always 9:16, else its format. */
export const kindOf = (i: Pick<PortfolioItem, "category" | "format">): MediaKind =>
  i.category === "ai-avatar" ? "ai-avatar" : i.format;

/** Ratio as a number (width / height). */
export const ratioOf = (k: MediaKind) => {
  const [w, h] = MEDIA[k].ratio.split("/").map((n) => Number(n.trim()));
  return w / h;
};

/**
 * Upload checks (warn, never block): smaller than the recommended export, or a shape far from
 * the format's ratio (more than 15% off), which means a hard crop.
 */
export function sizeWarnings(k: MediaKind, width?: number, height?: number): string[] {
  if (!width || !height) return [];
  const s = MEDIA[k];
  const out: string[] = [];
  const long = Math.max(width, height);
  const want = Math.max(s.width, s.height);
  if (long < want * 0.75)
    out.push(
      `This image is ${width}×${height}, smaller than the recommended ${exportSize(k)}. It may look soft on big screens.`,
    );
  const off = Math.abs(width / height / ratioOf(k) - 1);
  if (off > 0.15)
    out.push(
      `This image is far from ${s.ratioLabel}, so the site will crop it a lot. Check the preview below.`,
    );
  return out;
}

/* ---------- media references (lib/media-ref, kept small for client components) ---------- */

export { fileKey, fileVideoUrl, instagramVideoUrl, isFileVideo, R2_PREFIX } from "./media-ref";

/** The photos in a photo set, cover first-class: old single-photo items count as a set of one. */
export function photosOf(m: Media): NonNullable<Media["photos"]> {
  if (m.photos?.length) return m.photos;
  return m.src
    ? [{ src: m.src, alt: m.alt, width: m.width, height: m.height, focus: m.focus }]
    : [];
}
