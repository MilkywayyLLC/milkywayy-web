import { createHash } from "node:crypto";
import { publicDb } from "@/lib/supabase/public";

/**
 * Error alerts by email (Resend), for the owner (Phase 8). One email per problem per hour:
 * the database remembers what was already sent (record_alert). Live in production, or anywhere
 * with ALERTS=on; `force` skips that switch for the test alert. Never throws.
 *
 *   ALERT_EMAIL_TO   who gets alerts (default LEAD_EMAIL_TO, then hello@milkywayy.com)
 */
export type Alert = { kind: string; message: string; where?: string; detail?: string };

const enabled = () =>
  process.env.NEXT_PUBLIC_SITE_ENV === "production" || process.env.ALERTS === "on";

async function firstTime(fingerprint: string, minutes = 60) {
  const db = publicDb();
  if (!db || !process.env.LEAD_SECRET) return true;
  const { data, error } = await db.rpc("record_alert", {
    p_secret: process.env.LEAD_SECRET,
    p_fingerprint: fingerprint,
    p_minutes: minutes,
  });
  return error ? true : data === true; // if the database is the problem, alert anyway
}

export async function alert(a: Alert, opts: { force?: boolean; throttle?: string } = {}) {
  try {
    if ((!enabled() && !opts.force) || !process.env.RESEND_API_KEY) return false;
    const fp = createHash("sha256")
      .update(`${a.kind}|${a.where ?? ""}|${a.message.split("\n")[0].slice(0, 200)}`)
      .digest("hex")
      .slice(0, 40);
    if (!opts.force && !(await firstTime(fp))) return false;
    // A shared cap (e.g. browser errors) so a flood of different messages can't flood the inbox.
    if (!opts.force && opts.throttle && !(await firstTime(opts.throttle, 10))) return false;
    const site = process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL ?? "local";
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.LEAD_EMAIL_FROM || "Milkywayy website <onboarding@resend.dev>",
        to: [process.env.ALERT_EMAIL_TO || process.env.LEAD_EMAIL_TO || "hello@milkywayy.com"],
        subject: `⚠ Website ${a.kind}: ${a.message.split("\n")[0].slice(0, 90)}`,
        text: [
          `${a.kind} on ${site}`,
          a.where && `Where: ${a.where}`,
          `When: ${new Date().toISOString()}`,
          "",
          a.message,
          a.detail && `\n${a.detail.slice(0, 4000)}`,
          "",
          "Repeats of this exact problem are muted for an hour. Details: Vercel → milkywayy-web → Logs.",
        ]
          .filter((x) => typeof x === "string")
          .join("\n"),
      }),
    });
    return res.ok;
  } catch (err) {
    console.error("[alert] could not send", err);
    return false;
  }
}
