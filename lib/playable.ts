import type { Media, PortfolioItem } from "@/content/types";
import { reelMedia } from "@/lib/instagram";
import {
  fileVideoUrl,
  instagramVideoUrl,
  isFileVideo,
  kindOf,
  MEDIA,
  photosOf,
  type MediaKind,
} from "@/lib/media-config";
import { tourEmbed } from "@/lib/tours";
import { embedUrl } from "@/lib/video";

/**
 * What a click on a card opens (lib/media-config `opens`), worked out on the server so the browser
 * only gets what it needs: photo lists, our own video URLs, or an embed link. Instagram reels are
 * checked against the API here; one that can't play falls back to "View on Instagram ↗".
 */
export type Playable =
  | { type: "photos"; title: string; photos: { src: string; alt: string }[] }
  | { type: "file"; title: string; src: string; ratio: string; poster?: string }
  | { type: "embed"; title: string; src: string; ratio: string }
  | { type: "tour"; title: string; src: string; href: string };

export type Shown = PortfolioItem & {
  play?: Playable;
  /** "View on Instagram ↗": the reel's own link when it can't play here, or the optional post link. */
  instagramLink?: string;
};

/** A video reference (link or hosted file) as something our players can open. */
export function videoPlayable(
  video: string | undefined,
  title: string,
  kind: MediaKind,
  poster?: string,
): Playable | undefined {
  if (!video) return undefined;
  const ratio = MEDIA[kind].ratio;
  if (isFileVideo(video)) return { type: "file", title, src: fileVideoUrl(video), ratio, poster };
  const src = embedUrl(video);
  return src ? { type: "embed", title, src, ratio } : undefined;
}

async function forItem(i: PortfolioItem): Promise<Shown> {
  const kind = kindOf(i);
  const m: Media = i.media;
  const out: Shown = { ...i, instagramLink: m.instagramUrl };
  if (kind === "photo") {
    const photos = photosOf(m).map((p) => ({ src: p.src, alt: p.alt || m.alt }));
    if (photos.length) out.play = { type: "photos", title: i.title, photos };
    return out;
  }
  if (kind === "360") {
    const t = m.tour ? tourEmbed(m.tour) : null;
    if (t) out.play = { type: "tour", title: i.title, src: t.embed, href: m.tour! };
    return out;
  }
  if ((kind === "reel" || kind === "ai-avatar") && m.source !== "upload" && m.instagram) {
    const ok = m.instagram.id ? await reelMedia(m.instagram.id) : null;
    if (ok && m.instagram.id)
      out.play = {
        type: "file",
        title: i.title,
        src: instagramVideoUrl(m.instagram.id),
        ratio: MEDIA[kind].ratio,
        poster: m.src,
      };
    else out.instagramLink = m.instagram.url;
    return out;
  }
  out.play = videoPlayable(m.video, i.title, kind, m.src);
  return out;
}

/** Portfolio items with what each one opens. */
export const withPlayback = (items: PortfolioItem[]) => Promise.all(items.map(forItem));
