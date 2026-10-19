import { isBot, shareReport } from "@/lib/share";

/** "Report this page" from a public share page; lands in the admin's Reported filter (§7.4). */
export async function POST(req: Request) {
  const origin = req.headers.get("origin");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (isBot(req.headers.get("user-agent")) || !origin || !host || new URL(origin).host !== host)
    return Response.json({ ok: false }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const { kind, slug, reason } = body as { kind?: unknown; slug?: unknown; reason?: unknown };
  if ((kind !== "l" && kind !== "c") || typeof slug !== "string" || typeof reason !== "string")
    return Response.json({ ok: false }, { status: 400 });
  if (reason.trim().length < 3) return Response.json({ ok: false }, { status: 400 });
  const ok = await shareReport(kind, slug, reason.trim()).catch(() => false);
  return Response.json({ ok }, { status: ok ? 200 : 400 });
}
