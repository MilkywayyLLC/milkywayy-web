import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { portalAdminReady, portalAdminSystem, type ProjectListRow } from "@/lib/portal/admin";
import { calendarToken, icsFeed } from "@/lib/portal/calendar";

/** The private ICS feed of shoot bookings (see lib/portal/calendar.ts). */
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const want = calendarToken();
  const given = token.replace(/\.ics$/, "");
  if (
    !want ||
    !portalAdminReady() ||
    given.length !== want.length ||
    !timingSafeEqual(Buffer.from(given), Buffer.from(want))
  )
    return new NextResponse("Not found", { status: 404 });
  const rows = await portalAdminSystem<ProjectListRow[]>("portal_admin_projects", {
    p_type: "shoot",
  });
  const shoots = rows
    .filter((r) => r.shoot_date && r.status !== "completed")
    .map((r) => ({
      id: r.id,
      ref: r.ref,
      title: r.title,
      status: r.status,
      shoot_date: r.shoot_date!.slice(0, 10),
      slot: r.slot,
      client: r.account_name ?? r.client_name,
      address:
        r.meta.booking?.location.address ??
        ([r.meta.building, r.meta.area].filter(Boolean).join(", ") || null),
    }));
  return new NextResponse(icsFeed(shoots, req.nextUrl.origin), {
    headers: {
      "content-type": "text/calendar; charset=utf-8",
      "cache-control": "private, max-age=300",
    },
  });
}
