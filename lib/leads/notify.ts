import type { Lead } from "./store";

/**
 * After a lead is saved: an email to the owner (Resend), an optional webhook (LEAD_WEBHOOK_URL,
 * e.g. n8n/Make) and, when the visitor chose email, a short confirmation to them.
 *
 *   RESEND_API_KEY   turns email on (nothing is sent without it)
 *   LEAD_EMAIL_TO    who gets the alert (default hello@milkywayy.com)
 *   LEAD_EMAIL_FROM  sender; until milkywayy.com is verified in Resend, alerts go out from
 *                    onboarding@resend.dev (allowed only to the Resend account's own email)
 *                    and visitor confirmations are skipped.
 *
 * Test leads (an @example.com email or a name starting "E2E ") never send anything.
 */
const RESEND_TEST_FROM = "Milkywayy website <onboarding@resend.dev>";

const TYPE_LABEL: Record<string, string> = {
  production: "Production",
  property: "Property shoot",
  post: "Post-production",
  avatars: "AI avatar demo",
  contact: "Contact",
  "free-test": "Free test edit",
};

export const isTestLead = (l: Lead) =>
  !!l.email?.toLowerCase().endsWith("@example.com") || !!l.name?.startsWith("E2E ");

function summary(l: Lead, ref: string, adminUrl: string) {
  const d = l.data as Record<string, unknown>;
  const lines: [string, unknown][] = [
    ["Ref", ref],
    ["Type", TYPE_LABEL[l.type] ?? l.type],
    ["Name", l.name],
    ["Company", l.company],
    ["Phone", l.phone],
    ["Email", l.email],
    ["Reply by", l.preferred_reply],
    ["Service", d.service],
    ["What for", d.use === "Other" ? d.use_other : d.use],
    ["Needs", Array.isArray(d.what) ? (d.what as string[]).join(", ") : undefined],
    ["Volume", d.volume],
    ["Editing now", d.now],
    ["Country", d.country],
    ["Link", d.link],
    ["Message", d.brief],
    ["Booking", d.message],
    [
      "Estimate",
      d.estimate
        ? `AED ${(d.estimate as { total: number }).total.toLocaleString("en-US")}`
        : undefined,
    ],
    ["Page", l.page],
    [
      "Source",
      Object.entries(l.utm)
        .map(([k, v]) => `${k}=${v}`)
        .join(" · ") || l.referrer,
    ],
  ];
  const text = lines
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => `${k}: ${v}`)
    .join("\n");
  return `${text}\n\nOpen in the admin: ${adminUrl}`;
}

async function resend(body: Record<string, unknown>) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
}

export async function notifyLead(l: Lead, ref: string, origin: string) {
  if (isTestLead(l)) return;
  const adminUrl = `${origin}/admin/leads/${ref}`;
  const text = summary(l, ref, adminUrl);
  const jobs: Promise<unknown>[] = [];

  if (process.env.RESEND_API_KEY) {
    const from = process.env.LEAD_EMAIL_FROM || RESEND_TEST_FROM;
    jobs.push(
      resend({
        from,
        to: [process.env.LEAD_EMAIL_TO || "hello@milkywayy.com"],
        reply_to: l.email || undefined,
        subject: `New lead ${ref} · ${TYPE_LABEL[l.type] ?? l.type}${l.name ? ` · ${l.name}` : ""}`,
        text,
      }),
    );
    // Visitor confirmation: only from a verified milkywayy.com sender, and only if they chose email.
    const wantsEmail =
      l.preferred_reply === "Email" || (l.data as { path?: string }).path === "email";
    if (process.env.LEAD_EMAIL_FROM && !from.includes("resend.dev") && l.email && wantsEmail)
      jobs.push(
        resend({
          from,
          to: [l.email],
          reply_to: process.env.LEAD_EMAIL_TO || "hello@milkywayy.com",
          subject: `We've got your request (Ref ${ref})`,
          text: [
            `Hi${l.name ? ` ${l.name.split(" ")[0]}` : ""},`,
            "",
            `Thanks for getting in touch with Milkywayy. We've received your request (Ref ${ref}) and will reply to this email shortly.`,
            "",
            "If it's urgent, WhatsApp us on +971 50 726 3306 and quote the ref.",
            "",
            "Milkywayy",
            "milkywayy.com",
          ].join("\n"),
        }),
      );
  }
  if (process.env.LEAD_WEBHOOK_URL)
    jobs.push(
      fetch(process.env.LEAD_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ref, ...l, adminUrl, text }),
      }).then((r) => {
        if (!r.ok) throw new Error(`Webhook ${r.status}`);
      }),
    );

  const results = await Promise.allSettled(jobs);
  for (const r of results)
    if (r.status === "rejected") console.error(`[lead] ${ref}: notification failed`, r.reason);
}
