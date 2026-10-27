import { NextResponse, type NextRequest } from "next/server";
import { portalAdminReady, portalAdminSystem } from "@/lib/portal/admin";
import { icsTokenOk } from "@/lib/portal/calendar";
import { shootEventOf } from "@/lib/portal/shoot-calendar";
import type { Project } from "@/lib/portal/projects";

/**
 * "Add to calendar (.ics)" for one shoot (phase 1, 27 Oct 2026): from the client's shoot page, the
 * admin's project page and the confirmation email. The link is signed per shoot, so it works from an
 * email without signing in and reveals only that shoot's title, time and address.
 */
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (
    !/^[0-9a-f-]{36}$/.test(id) ||
    !icsTokenOk(id, req.nextUrl.searchParams.get("t")) ||
    !portalAdminReady()
  )
    return new NextResponse("Not found", { status: 404 });
  const d = await portalAdminSystem<{ project: Project } | null>("portal_admin_project", {
    p_id: id,
  }).catch(() => null);
  const p = d?.project;
  if (!p || p.type !== "shoot" || !p.shoot_date || p.status === "cancelled")
    return new NextResponse("Not found", { status: 404 });
  const { ics } = shootEventOf(p, req.nextUrl.origin);
  return new NextResponse(ics, {
    headers: {
      "content-type": "text/calendar; charset=utf-8",
      "content-disposition": `attachment; filename="${p.ref}.ics"`,
      "cache-control": "private, max-age=60",
    },
  });
}
