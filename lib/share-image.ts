import { getObject } from "@/lib/r2";
import { sharePage, type SharePhoto } from "@/lib/share";

async function firstPhoto(kind: "l" | "c", slug: string): Promise<SharePhoto | null> {
  if (kind === "l") {
    const d = await sharePage("l", slug);
    return d.state === "live" ? (d.photos[0] ?? null) : null;
  }
  const d = await sharePage("c", slug);
  return d.state === "live" ? (d.listings[0]?.photo ?? null) : null;
}

/**
 * The preview image apps fetch for a share link. Served from our own address (not a signed R2
 * link) so it never expires in a chat's preview cache; streamed from R2 only while the page is
 * live. Anything else gets the Milkywayy default.
 */
export async function shareImage(req: Request, kind: "l" | "c", slug: string) {
  const fallback = () => Response.redirect(new URL("/brand/og.png", req.url), 302);
  try {
    const key = (await firstPhoto(kind, slug))?.og;
    const obj = key ? await getObject(key) : null;
    if (!obj?.body) return fallback();
    return new Response(obj.body, {
      headers: {
        "Content-Type": "image/jpeg",
        "Cache-Control": "public, max-age=3600, s-maxage=3600",
        "X-Robots-Tag": "noindex",
      },
    });
  } catch {
    return fallback();
  }
}
