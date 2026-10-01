import { NextResponse, type NextRequest } from "next/server";
import { publicDb } from "@/lib/supabase/public";

/** The Cal.com embed reported a booked call for this ref: mark it on the lead (admin shows it). */
export async function POST(req: NextRequest) {
  const { ref } = (await req.json().catch(() => ({}))) as { ref?: unknown };
  if (typeof ref !== "string" || !/^MW-\d{4,9}$/.test(ref))
    return NextResponse.json({}, { status: 400 });
  const db = publicDb();
  if (db && process.env.LEAD_SECRET)
    await db.rpc("mark_call_booked", { p_secret: process.env.LEAD_SECRET, p_ref: ref });
  return NextResponse.json({ ok: true });
}
