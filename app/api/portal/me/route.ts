import { NextResponse } from "next/server";
import { leadsInPortalDb } from "@/lib/leads/store";
import { currentClient } from "@/lib/portal/auth";

/**
 * Who is signed in to the portal, for prefilling the booking form (owner QA, 3 Oct 2026). Same
 * origin only (the session cookie never leaves the site); nothing for signed-out visitors.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const c = await currentClient().catch(() => null);
  if (!c)
    return NextResponse.json({ signedIn: false }, { headers: { "Cache-Control": "no-store" } });
  const { data: profile } = await c.db
    .from("profiles")
    .select("full_name, phone_e164")
    .eq("user_id", c.user.id)
    .maybeSingle();
  return NextResponse.json(
    {
      signedIn: true,
      name: profile?.full_name ?? "",
      email: c.user.email ?? "",
      phone: profile?.phone_e164 ?? (c.user.phone ? `+${c.user.phone}` : ""),
      account: c.current.account.name,
      attaches: leadsInPortalDb(),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
