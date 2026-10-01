import { NextResponse, type NextRequest } from "next/server";
import { alert } from "@/lib/monitoring/alert";
import { publicDb } from "@/lib/supabase/public";

/**
 * Uptime check: 200 when the site can read the database, 503 when it can't. Point an uptime
 * monitor here (see LAUNCH.md). With the cron secret, ?test-alert=1 sends a test alert email.
 */
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (req.nextUrl.searchParams.get("test-alert") === "1") {
    if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`)
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    const sent = await alert(
      { kind: "test alert", message: "This is a test: error alerts reach you." },
      { force: true },
    );
    return NextResponse.json({ sent });
  }
  const db = publicDb();
  const started = Date.now();
  const result = db
    ? await Promise.race([
        db
          .from("site_settings")
          .select("key")
          .limit(1)
          .then((r) => !r.error),
        new Promise<boolean>((r) => setTimeout(() => r(false), 5000)),
      ])
    : false;
  return NextResponse.json(
    { ok: result, database: result ? "ok" : "unreachable", ms: Date.now() - started },
    { status: result ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
