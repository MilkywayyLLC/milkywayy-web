import { NextResponse, type NextRequest } from "next/server";
import { publicDb } from "@/lib/supabase/public";

/**
 * Weekly leads email (Phase 8): every Monday 09:00 Dubai (vercel.json cron), the last 7 days of
 * leads to LEAD_EMAIL_TO. Vercel calls this with `Authorization: Bearer $CRON_SECRET`; the leads
 * are read through leads_since(), which needs REPORT_SECRET (read-only, separate from LEAD_SECRET).
 */
export const dynamic = "force-dynamic";

const TYPE: Record<string, string> = {
  property: "Property shoot",
  production: "Production",
  contact: "Contact",
  avatars: "AI avatar demo",
  "free-test": "Free test edit",
  post: "Post-production",
};

type Row = {
  ref: string;
  type: string;
  name: string | null;
  company: string | null;
  phone: string | null;
  email: string | null;
  preferred_reply: string | null;
  status: string;
  call_booked_at: string | null;
  created_at: string;
  summary: string;
};

export async function GET(req: NextRequest) {
  if (
    !process.env.CRON_SECRET ||
    req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`
  )
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const db = publicDb();
  if (!db || !process.env.REPORT_SECRET)
    return NextResponse.json({ error: "not configured" }, { status: 500 });
  const since = new Date(Date.now() - 7 * 864e5);
  const { data, error } = await db.rpc("leads_since", {
    p_secret: process.env.REPORT_SECRET,
    p_since: since.toISOString(),
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const leads = (data ?? []) as Row[];

  const day = (iso: string) =>
    new Date(iso).toLocaleDateString("en-GB", {
      weekday: "short",
      day: "numeric",
      month: "short",
      timeZone: "Asia/Dubai",
    });
  const byType = Object.entries(
    leads.reduce<Record<string, number>>((m, l) => ({ ...m, [l.type]: (m[l.type] ?? 0) + 1 }), {}),
  ).map(([t, n]) => `${TYPE[t] ?? t}: ${n}`);
  const open = leads.filter((l) => l.status === "new").length;
  const origin = req.nextUrl.origin;
  const text = [
    `${leads.length} new lead${leads.length === 1 ? "" : "s"} from ${day(since.toISOString())} to ${day(new Date().toISOString())}.`,
    leads.length ? `${byType.join(" · ")}` : "No leads this week.",
    leads.length ? `${open} still marked New.` : "",
    "",
    ...leads.map((l) =>
      [
        `${l.ref} · ${day(l.created_at)} · ${TYPE[l.type] ?? l.type} · ${l.status}${l.call_booked_at ? " · call booked" : ""}`,
        `  ${[l.name, l.company].filter(Boolean).join(", ") || "No name"} · ${[l.phone, l.email].filter(Boolean).join(" · ") || "no contact"}${l.preferred_reply ? ` · reply by ${l.preferred_reply}` : ""}`,
        l.summary ? `  ${l.summary.slice(0, 160)}` : "",
        `  ${origin}/admin/leads/${l.ref}`,
      ]
        .filter(Boolean)
        .join("\n"),
    ),
    "",
    `All leads: ${origin}/admin/leads`,
  ].join("\n");

  let emailed = false;
  if (process.env.RESEND_API_KEY) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.LEAD_EMAIL_FROM || "Milkywayy website <onboarding@resend.dev>",
        to: [process.env.LEAD_EMAIL_TO || "hello@milkywayy.com"],
        subject: `Milkywayy leads this week: ${leads.length}`,
        text,
      }),
    });
    emailed = res.ok;
  }
  return NextResponse.json({ leads: leads.length, emailed });
}
