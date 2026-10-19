import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { portalAdminReady, portalAdminSystem } from "@/lib/portal/admin";
import { projectLink } from "@/lib/portal/messages";
import { alertMilkywayy, notifyClients, type Recipient } from "@/lib/portal/notify";
import { refreshInstagramToken } from "@/lib/instagram";
import { emailPublished } from "@/lib/portal/invoice-actions";
import { deleteObject, r2Ready } from "@/lib/r2";

/**
 * Portal housekeeping (CLIENT_PORTAL_GUIDE §5.7, §13), daily via vercel.json:
 *   1. delivered projects with no open revision complete themselves 7 days after delivery;
 *   2. files past their retention date are deleted from R2, then marked deleted;
 *   3. clients are emailed 14 days before their delivered files are deleted;
 *   4. Due invoices past their due date become Overdue;
 *   5. last month's statements are frozen (on the 1st, and any later day one is missing);
 *   6. the website's Instagram token is renewed once a week (lib/instagram.ts);
 *   7. invoices (owner, 10 Oct 2026): from the 25th, month-end drafts for review (Milkywayy is
 *      emailed when new ones are ready); approved invoices whose date has come are published and
 *      the client gets the "New invoice" email.
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
  // Invoices past their due date become Overdue (Phase 12).
  const overdue = await portalAdminSystem<number>("portal_admin_mark_overdue");

  // Month-end statements (billing add-on): idempotent, so a missed day catches up.
  const statements = await portalAdminSystem<number>("portal_admin_freeze_statements").catch(
    (e) => (console.error("[housekeeping] statements:", e), 0),
  );

  const deleted: string[] = [];
  // Share-page web versions of these files (WebP, preview JPEG, web MP4, poster) go with them.
  const webKeys = out.expired.length
    ? await portalAdminSystem<string[]>("portal_admin_web_keys", {
        p_ids: out.expired.map((f) => f.id),
      }).catch(() => [] as string[])
    : [];
  if (r2Ready())
    for (const f of out.expired) {
      try {
        await deleteObject(f.key);
        await deleteObject(`${f.key}.thumb.webp`).catch(() => undefined);
        for (const k of webKeys.filter((k) => k.includes(`/web/${f.id}.`)))
          await deleteObject(k).catch(() => undefined);
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

  // Invoice drafts (from the 25th; safe to repeat) and scheduled publishing.
  const drafts = await portalAdminSystem<{ created: number }>("portal_admin_generate_drafts").catch(
    (e) => (console.error("[housekeeping] drafts:", e), { created: 0 }),
  );
  if (drafts.created)
    await alertMilkywayy(
      `${drafts.created} invoice draft${drafts.created === 1 ? "" : "s"} ready for review`,
      ["Month-end invoice drafts are ready. Review, edit and approve them in the invoice queue."],
      `${env.siteUrl}/admin/billing/queue`,
    );
  const published = await portalAdminSystem<Parameters<typeof emailPublished>[0][]>(
    "portal_admin_publish_due",
  ).catch((e) => (console.error("[housekeeping] publish:", e), []));
  let invoiceEmails = 0;
  for (const p of published) invoiceEmails += await emailPublished(p, env.siteUrl, "cron");

  // The Instagram long-lived token lasts 60 days; renewing weekly keeps it alive indefinitely.
  const instagram = await refreshInstagramToken().catch((e) => ({
    error: e instanceof Error ? e.message : "failed",
  }));
  if ("error" in instagram) console.error("[housekeeping] instagram token:", instagram.error);

  return NextResponse.json({
    instagram,
    drafts_created: drafts.created,
    invoices_published: published.length,
    invoice_emails: invoiceEmails,
    auto_completed: out.auto_completed,
    files_deleted: deleted.length,
    files_waiting: out.expired.length - deleted.length,
    warned,
    invoices_overdue: overdue,
    statements_frozen: statements,
  });
}
