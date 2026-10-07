"use server";

import { adminOrThrow } from "@/lib/admin/auth";
import { storeImage, type Stored } from "@/lib/admin/store-image";
import { matchReel, reelMedia, type ReelMatch } from "@/lib/instagram";
import { presign, r2Ready } from "@/lib/r2";

/**
 * Admin media actions (owner, 7 Oct 2026). Video files go straight from the browser to R2 with a
 * presigned PUT (only the optimised web version is stored, under site/…); Instagram links are
 * checked against our account; a reel's own cover can be copied into the site's image storage.
 */
const MAX_VIDEO = 150 * 1024 * 1024;
const FOLDERS = ["reels", "avatars", "showreel"] as const;
export type VideoFolder = (typeof FOLDERS)[number];

export async function startSiteVideoUpload(
  folder: VideoFolder,
  bytes: number,
  type: string,
): Promise<{ ok: true; url: string; ref: string } | { ok: false; error: string }> {
  try {
    await adminOrThrow();
  } catch {
    return { ok: false, error: "Sign in again." };
  }
  if (!FOLDERS.includes(folder)) return { ok: false, error: "Unknown video kind." };
  if (!(bytes > 0) || bytes > MAX_VIDEO)
    return { ok: false, error: "Videos can be up to 150 MB. Export a shorter or smaller file." };
  const ext = type === "video/quicktime" ? "mov" : type === "video/webm" ? "webm" : "mp4";
  const key = `site/${folder}/${crypto.randomUUID()}.${ext}`;
  if (r2Ready()) return { ok: true, url: presign("PUT", key, 3600), ref: `r2:${key}` };
  // Local runs without R2 (tests): the dev media origin stands in for the bucket.
  const dev = process.env.SHARE_DEV_MEDIA_ORIGIN;
  if (dev && process.env.NEXT_PUBLIC_SITE_ENV !== "production")
    return { ok: true, url: `${dev.replace(/\/$/, "")}/${key}`, ref: `r2:${key}` };
  return { ok: false, error: "Video storage (R2) isn’t set up here." };
}

export async function checkInstagramReel(url: string): Promise<ReelMatch> {
  try {
    await adminOrThrow();
  } catch {
    return { state: "error", message: "Sign in again." };
  }
  return matchReel(url);
}

/** Copy one of our reels' own cover (thumbnail_url, fetched server-side) into image storage. */
export async function importInstagramCover(
  id: string,
): Promise<({ ok: true } & Stored) | { ok: false; error: string }> {
  let db;
  try {
    ({ db } = await adminOrThrow());
  } catch {
    return { ok: false, error: "Sign in again." };
  }
  const m = await reelMedia(id);
  if (!m?.thumbnailUrl) return { ok: false, error: "Instagram didn’t give a cover for this reel." };
  const res = await fetch(m.thumbnailUrl, { signal: AbortSignal.timeout(15_000) }).catch(
    () => null,
  );
  if (!res?.ok) return { ok: false, error: "Couldn’t download the cover from Instagram." };
  const r = await storeImage(db, Buffer.from(await res.arrayBuffer()), "an Instagram reel cover");
  return "error" in r ? { ok: false, error: r.error } : { ok: true, ...r };
}
