import { NextResponse, type NextRequest } from "next/server";
import { refresh } from "@/lib/data/refresh";
import { ALL_TAGS, type Tag } from "@/lib/data/tags";

/**
 * On-demand revalidation (guide §18.1): POST { "tags": ["pricing", …] } with the header
 * `x-revalidate-secret: $REVALIDATE_SECRET`. The admin refreshes on save by itself; this route is
 * for anything outside the app (scripts, a database webhook). See lib/data/refresh.ts.
 */
export async function POST(req: NextRequest) {
  const secret = process.env.REVALIDATE_SECRET;
  if (!secret || req.headers.get("x-revalidate-secret") !== secret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = (await req.json().catch(() => ({}))) as { tags?: unknown };
  const requested = Array.isArray(body.tags) ? body.tags : ALL_TAGS;
  const tags = requested.filter((t): t is Tag => (ALL_TAGS as string[]).includes(String(t)));
  refresh(tags, req.nextUrl.origin);
  return NextResponse.json({ revalidated: tags });
}
