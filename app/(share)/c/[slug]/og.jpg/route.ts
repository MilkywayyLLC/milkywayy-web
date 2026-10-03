import { shareImage } from "@/lib/share-image";

/** The collection's share-preview image: its first home's photo. */
export async function GET(req: Request, ctx: RouteContext<"/c/[slug]/og.jpg">) {
  return shareImage(req, "c", (await ctx.params).slug);
}
