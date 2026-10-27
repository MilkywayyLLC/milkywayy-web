import { presign, r2Ready } from "@/lib/r2";

/**
 * Photo previews (phase 1 part 6, 27 Oct 2026). A preview used to exist only when the admin's
 * browser made it at upload (`<key>.thumb.webp`); Safari can't encode WebP, so nothing uploaded from
 * it had one and every place showing previews (Home "Your files are ready", the delivery grid, the
 * listing builder) had nothing to show. Now: the stored preview when there is one, otherwise
 * /api/portal/thumb/<id>, which makes it on the server (sharp), stores it and serves it.
 */
export type ThumbFile = {
  id: string;
  source?: string | null;
  r2_key?: string | null;
  thumb_key?: string | null;
  content_type?: string | null;
  label?: string | null;
};

const IMAGE = /\.(jpe?g|png|webp|avif|tiff?|heic|heif)$/i;
export const isPhoto = (f: ThumbFile) =>
  /^image\//.test(f.content_type ?? "") || IMAGE.test(f.r2_key ?? f.label ?? "");

export function thumbSrc(f: ThumbFile): string | null {
  if (f.thumb_key && r2Ready()) return presign("GET", f.thumb_key, 3600);
  if ((f.source ?? "r2") === "r2" && f.r2_key && isPhoto(f)) return `/api/portal/thumb/${f.id}`;
  return null;
}
