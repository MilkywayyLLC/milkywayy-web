import { isBot, shareTrack } from "@/lib/share";

/**
 * Counts a view or a WhatsApp/Call tap on a share page (§6.4). Bots are dropped here: anything
 * that looks like a crawler, link-preview fetcher, headless browser or script by its user agent,
 * and anything posted from another site. Views only come from the page's script, which crawlers
 * don't run, and once per browser tab.
 */
export async function POST(req: Request) {
  const ua = req.headers.get("user-agent");
  const origin = req.headers.get("origin");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (isBot(ua) || (origin && host && new URL(origin).host !== host))
    return new Response(null, { status: 204 });
  let body: { kind?: unknown; slug?: unknown; event?: unknown };
  try {
    body = JSON.parse(await req.text());
  } catch {
    return new Response(null, { status: 400 });
  }
  const { kind, slug, event } = body;
  if (
    (kind !== "l" && kind !== "c") ||
    typeof slug !== "string" ||
    (event !== "view" && event !== "wa" && event !== "call")
  )
    return new Response(null, { status: 400 });
  await shareTrack(kind, slug, event).catch(() => false);
  return new Response(null, { status: 204 });
}
