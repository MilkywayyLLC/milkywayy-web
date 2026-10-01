import { revalidateTag } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";
import { ALL_TAGS, type Tag } from "@/lib/data/tags";

/**
 * On-demand revalidation (guide §18.1): POST { "tags": ["pricing", …] } with the header
 * `x-revalidate-secret: $REVALIDATE_SECRET`. The admin calls revalidateTag directly; this route is
 * for anything outside the app (scripts, a database webhook). `expire: 0` makes the next page load
 * fetch fresh data instead of serving the old version once more.
 */
export async function POST(req: NextRequest) {
  const secret = process.env.REVALIDATE_SECRET;
  if (!secret || req.headers.get("x-revalidate-secret") !== secret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = (await req.json().catch(() => ({}))) as { tags?: unknown };
  const requested = Array.isArray(body.tags) ? body.tags : ALL_TAGS;
  const tags = requested.filter((t): t is Tag => (ALL_TAGS as string[]).includes(String(t)));
  for (const tag of tags) revalidateTag(tag, { expire: 0 });
  return NextResponse.json({ revalidated: tags });
}
