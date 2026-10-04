import { createClient } from "@supabase/supabase-js";
import {
  emailFor,
  invoiceEmail,
  portalReadyEmail,
  type BillingEmail,
  type MessageEvent,
  type ProjectInfo,
} from "./messages";
import { portalKey, portalUrl } from "./supabase";

/**
 * Client emails (CLIENT_PORTAL_GUIDE §8, v2): Resend, from a milkywayy.com address, one email per
 * recipient (no one sees the others' addresses), replies to hello@. Every send, skip or failure is
 * written to notification_log. Never throws: a failed email never blocks the change itself.
 *
 *   RESEND_API_KEY          no key = nothing sent (logged as skipped)
 *   PORTAL_EMAIL_FROM       e.g. "Milkywayy <portal@milkywayy.com>" (default LEAD_EMAIL_FROM)
 *   LEAD_EMAIL_TO           where Milkywayy's own notices go (revision requested, client message)
 */
export type Recipient = { email: string; name?: string | null };

const from = () =>
  process.env.PORTAL_EMAIL_FROM ||
  process.env.LEAD_EMAIL_FROM ||
  "Milkywayy <onboarding@resend.dev>";
const replyTo = () => process.env.LEAD_EMAIL_TO || "hello@milkywayy.com";
/** Test accounts never get real email (their sends are logged as skipped). */
const isTestAddress = (e: string) => /@example\.com$/i.test(e);

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Plain, light Viewfinder-style email: text first, one button. */
export function renderEmail(lines: string[], button: string, link: string) {
  const text = [...lines, "", `${button}: ${link}`, "", "Milkywayy · Dubai · milkywayy.com"].join(
    "\n\n",
  );
  const html = `<!doctype html><html><body style="margin:0;background:#f5f4f0;font-family:Helvetica,Arial,sans-serif;color:#111110">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f4f0;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border:1px solid #dad6cd">
<tr><td style="padding:22px 24px 6px;font-weight:700;letter-spacing:.04em;font-size:15px"><span style="color:#e5484d">●</span> MILKYWAYY</td></tr>
<tr><td style="padding:6px 24px 4px;font-size:15px;line-height:1.55">${lines.map((l) => `<p style="margin:0 0 14px">${esc(l).replace(/\n/g, "<br>")}</p>`).join("")}</td></tr>
<tr><td style="padding:2px 24px 26px"><a href="${esc(link)}" style="display:inline-block;background:#111110;color:#f5f4f0;text-decoration:none;font-weight:600;padding:13px 20px">${esc(button)}</a></td></tr>
</table>
<p style="font-size:12px;color:#5f5a52;margin:14px 0 0">Milkywayy · Dubai · <a href="https://milkywayy.com" style="color:#5f5a52">milkywayy.com</a> · Reply to this email to reach us.</p>
</td></tr></table></body></html>`;
  return { text, html };
}

async function log(
  projectId: string,
  template: string,
  to: string,
  status: string,
  providerId?: string,
  error?: string,
  actor = "portal",
) {
  if (!process.env.PORTAL_ADMIN_SECRET) return;
  const db = createClient(portalUrl, portalKey, { auth: { persistSession: false } });
  const { error: e } = await db.rpc("portal_admin_log_notification", {
    p_secret: process.env.PORTAL_ADMIN_SECRET,
    p_actor: actor,
    p_project: projectId,
    p_channel: "email",
    p_template: template,
    p_to: to,
    p_status: status,
    p_provider_id: providerId ?? null,
    p_error: error ?? null,
  });
  if (e) console.error("[notify] couldn't log:", e.message);
}

export async function sendEmail(to: string, subject: string, text: string, html: string) {
  if (!process.env.RESEND_API_KEY)
    return { status: "skipped" as const, error: "RESEND_API_KEY not set" };
  if (isTestAddress(to)) return { status: "skipped" as const, error: "test address" };
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from: from(), to: [to], reply_to: replyTo(), subject, text, html }),
    });
    const out = (await r.json().catch(() => ({}))) as { id?: string; message?: string };
    return r.ok
      ? { status: "sent" as const, id: out.id }
      : { status: "failed" as const, error: `${r.status} ${out.message ?? ""}`.trim() };
  } catch (e) {
    return { status: "failed" as const, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Emails one event to each recipient and logs every attempt. Returns how many were sent. */
export async function notifyClients(
  projectId: string,
  event: MessageEvent,
  project: ProjectInfo,
  recipients: Recipient[],
  o: { link: string; label?: string; text?: string; expires?: string; actor?: string },
) {
  let sent = 0;
  for (const r of recipients) {
    const m = emailFor(event, project, { ...o, name: r.name });
    const { text, html } = renderEmail(m.lines, m.button, o.link);
    const res = await sendEmail(r.email, m.subject, text, html);
    if (res.status === "sent") sent++;
    else console.warn(`[notify] ${event} to ${r.email}: ${res.status} (${res.error})`);
    await log(
      projectId,
      event,
      r.email,
      res.status,
      "id" in res ? res.id : undefined,
      "error" in res ? res.error : undefined,
      o.actor,
    );
  }
  return sent;
}

/** Milkywayy's own notices (a client asked for a revision, or wrote a message). */
export async function notifyMilkywayy(
  projectId: string,
  template: string,
  subject: string,
  lines: string[],
  link: string,
) {
  const to = replyTo();
  const { text, html } = renderEmail(lines, "Open in the admin", link);
  const res = await sendEmail(to, subject, text, html);
  await log(
    projectId,
    template,
    to,
    res.status,
    "id" in res ? res.id : undefined,
    "error" in res ? res.error : undefined,
    "client",
  );
}

/** Billing emails to an account's Owner/Admins and billing copies, each logged (no project). */
export async function notifyBilling(
  account: string,
  kind: BillingEmail,
  inv: { number: string; amount: string; due: string; reason?: string | null },
  recipients: Recipient[],
  link: string,
  actor = "admin",
) {
  let sent = 0;
  for (const r of recipients) {
    const m = invoiceEmail(kind, inv, { name: r.name, link });
    const { text, html } = renderEmail(m.lines, m.button, link);
    const res = await sendEmail(r.email, m.subject, text, html);
    if (res.status === "sent") sent++;
    if (!process.env.PORTAL_ADMIN_SECRET) continue;
    const db = createClient(portalUrl, portalKey, { auth: { persistSession: false } });
    const { error } = await db.rpc("portal_admin_log_billing_notification", {
      p_secret: process.env.PORTAL_ADMIN_SECRET,
      p_actor: actor,
      p_account: account,
      p_template: kind,
      p_to: r.email,
      p_status: res.status,
      p_provider_id: "id" in res ? (res.id ?? null) : null,
      p_error: "error" in res ? (res.error ?? null) : null,
    });
    if (error) console.error("[notify] couldn't log billing email:", error.message);
  }
  return sent;
}

/** Milkywayy's own billing notice (e.g. a client says they've paid by bank transfer), logged. */
export async function alertMilkywayyBilling(
  account: string,
  template: string,
  subject: string,
  lines: string[],
  link: string,
) {
  const to = replyTo();
  const { text, html } = renderEmail(lines, "Open in the admin", link);
  const res = await sendEmail(to, subject, text, html);
  if (!process.env.PORTAL_ADMIN_SECRET) return;
  const db = createClient(portalUrl, portalKey, { auth: { persistSession: false } });
  const { error } = await db.rpc("portal_admin_log_billing_notification", {
    p_secret: process.env.PORTAL_ADMIN_SECRET,
    p_actor: "client",
    p_account: account,
    p_template: template,
    p_to: to,
    p_status: res.status,
    p_provider_id: "id" in res ? (res.id ?? null) : null,
    p_error: "error" in res ? (res.error ?? null) : null,
  });
  if (error) console.error("[notify] couldn't log billing alert:", error.message);
}

/** "Your Milkywayy portal is ready" to one invited person, logged. Returns the send status. */
export async function sendPortalInvite(
  account: string,
  invite: { email: string; name: string | null; role: string; account_name: string },
  origin: string,
) {
  const link = `${origin}/portal/login?email=${encodeURIComponent(invite.email)}`;
  const m = portalReadyEmail({
    name: invite.name,
    account: invite.account_name,
    role: invite.role,
    link,
  });
  const { text, html } = renderEmail(m.lines, m.button, link);
  const res = await sendEmail(invite.email, m.subject, text, html);
  if (process.env.PORTAL_ADMIN_SECRET) {
    const db = createClient(portalUrl, portalKey, { auth: { persistSession: false } });
    const { error } = await db.rpc("portal_admin_log_billing_notification", {
      p_secret: process.env.PORTAL_ADMIN_SECRET,
      p_actor: "admin",
      p_account: account,
      p_template: "portal_invite",
      p_to: invite.email,
      p_status: res.status,
      p_provider_id: "id" in res ? (res.id ?? null) : null,
      p_error: "error" in res ? (res.error ?? null) : null,
    });
    if (error) console.error("[notify] couldn't log the invite email:", error.message);
  }
  return res.status;
}
