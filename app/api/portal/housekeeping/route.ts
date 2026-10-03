import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { portalAdminReady, portalAdminSystem } from "@/lib/portal/admin";
import { projectLink } from "@/lib/portal/messages";
import { notifyClients, type Recipient } from "@/lib/portal/notify";
import { deleteObject, r2Ready } from "@/lib/r2";

/**
 * Portal housekeeping (CLIENT_PORTAL_GUIDE §5.7, §13), daily via vercel.json:
 *   1. delivered projects with no open revision complete themselves 7 days after delivery;
 *   2. files past their retention date are deleted from R2, then marked deleted;
 *   3. clients are emailed 14 days before their delivered files are deleted.
 * Vercel calls it with `Authorization: Bearer $CRON_SECRET`.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Out = {
  auto_completed: number;
  expired: { id: string; key: string }[];
  warn: { project: string; ref: string; title: string; expires: string }[];
};

export async function GET(req: NextRequest) {
  if (
    !process.env.CRON_SECRET ||
    req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`
  )
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!portalAdminReady()) return NextResponse.json({ skipped: "portal not configured" });

  const out = await portalAdminSystem<Out>("portal_admin_housekeeping");

  const deleted: string[] = [];
  if (r2Ready())
    for (const f of out.expired) {
      try {
        await deleteObject(f.key);
        await deleteObject(`${f.key}.thumb.webp`).catch(() => undefined);
        deleted.push(f.id);
      } catch (e) {
        console.error("[housekeeping] R2 delete failed:", f.key, e);
      }
    }
  if (deleted.length) await portalAdminSystem("portal_admin_files_deleted", { p_ids: deleted });

  let warned = 0;
  for (const w of out.warn) {
    const recipients = await portalAdminSystem<Recipient[]>("portal_admin_recipients", {
      p_id: w.project,
      p_event: "files_expiring",
    });
    const expires = new Date(`${w.expires}T12:00:00`).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
    warned += await notifyClients(w.project, "files_expiring", w, recipients ?? [], {
      link: projectLink(env.siteUrl, w.ref),
      expires,
      actor: "cron",
    });
  }

  return NextResponse.json({
    auto_completed: out.auto_completed,
    files_deleted: deleted.length,
    files_waiting: out.expired.length - deleted.length,
    warned,
  });
}
