import { revalidateTag } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";
import { IG_ID, reelMedia, reelMediaFresh, reelTag } from "@/lib/instagram";

/**
 * One of our Instagram reels for our own player. Our server fetches the bytes from Instagram
 * (media_url, found through the API and cached 30 minutes) and streams them on, with Range
 * support so phones can seek. The page never contains an Instagram CDN link.
 */
export const runtime = "nodejs";

const PASS = ["content-type", "content-length", "content-range", "accept-ranges", "last-modified"];

async function pull(url: string, range: string | null) {
  return fetch(url, {
    headers: range ? { range } : {},
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  }).catch(() => null);
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!IG_ID.test(id)) return new NextResponse(null, { status: 404 });
  const range = req.headers.get("range");
  let media = await reelMedia(id);
  if (!media) return new NextResponse(null, { status: 404 });
  let up = await pull(media.mediaUrl, range);
  // Instagram's links expire: on a refusal, get a fresh one once and drop the cached copy.
  if (!up || [403, 404, 410].includes(up.status)) {
    revalidateTag(reelTag(id), "max");
    media = await reelMediaFresh(id);
    up = media ? await pull(media.mediaUrl, range) : null;
  }
  if (!up || (!up.ok && up.status !== 206)) return new NextResponse(null, { status: 502 });
  const headers = new Headers({
    "cache-control": "public, max-age=1800",
    "accept-ranges": "bytes",
  });
  for (const h of PASS) {
    const v = up.headers.get(h);
    if (v) headers.set(h, v);
  }
  if (!headers.get("content-type")?.startsWith("video/")) headers.set("content-type", "video/mp4");
  return new NextResponse(up.body, { status: up.status, headers });
}
