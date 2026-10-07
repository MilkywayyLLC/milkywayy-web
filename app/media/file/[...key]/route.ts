import { NextResponse } from "next/server";
import { pageMediaUrl } from "@/lib/r2";

/**
 * A video we host (reel uploads, AI avatar clips, the showreel): a redirect to a short-lived
 * signed R2 link, so the bucket stays private and the player streams (and seeks) from R2.
 * Only the site's own folder can be reached this way, never client files.
 */
export const runtime = "nodejs";

export async function GET(_req: Request, ctx: { params: Promise<{ key: string[] }> }) {
  const { key } = await ctx.params;
  const path = key.map((k) => decodeURIComponent(k)).join("/");
  if (!/^site\/[\w/-]+\.(mp4|mov|webm)$/i.test(path) || path.includes(".."))
    return new NextResponse(null, { status: 404 });
  const url = pageMediaUrl(path);
  if (!url) return new NextResponse(null, { status: 404 });
  return NextResponse.redirect(url, {
    status: 302,
    headers: { "cache-control": "public, max-age=3600" },
  });
}
