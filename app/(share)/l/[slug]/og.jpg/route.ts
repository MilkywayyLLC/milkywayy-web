import { shareImage } from "@/lib/share-image";

/** The share-preview image for WhatsApp and other apps: the first photo's JPEG (§6.2). */
export async function GET(req: Request, ctx: RouteContext<"/l/[slug]/og.jpg">) {
  return shareImage(req, "l", (await ctx.params).slug);
}
