import { after, NextResponse, type NextRequest } from "next/server";
import { leadDb } from "@/lib/leads/store";
import { sendCapi } from "@/lib/tracking/capi";

/**
 * The Cal.com embed reported a booked call for this ref: mark it on the lead (admin shows it)
 * and, with consent, send Schedule to the Conversions API (event id = the ref, like the Pixel).
 */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    ref?: unknown;
    consent?: unknown;
    fbp?: unknown;
    fbc?: unknown;
  };
  const ref = body.ref;
  if (typeof ref !== "string" || !/^MW-\d{4,9}$/.test(ref))
    return NextResponse.json({}, { status: 400 });
  const db = leadDb();
  if (db && process.env.LEAD_SECRET)
    await db.rpc("mark_call_booked", { p_secret: process.env.LEAD_SECRET, p_ref: ref });
  if (body.consent === true) {
    const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || undefined;
    after(() =>
      sendCapi({
        event: "Schedule",
        eventId: ref,
        url: req.headers.get("referer") ?? req.nextUrl.origin,
        ip,
        userAgent: req.headers.get("user-agent") ?? undefined,
        fbp: typeof body.fbp === "string" ? body.fbp : undefined,
        fbc: typeof body.fbc === "string" ? body.fbc : undefined,
      }),
    );
  }
  return NextResponse.json({ ok: true });
}
