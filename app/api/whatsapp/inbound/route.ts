import { after, type NextRequest } from "next/server";
import { getSiteSettings } from "@/lib/data";
import { firstTime } from "@/lib/monitoring/alert";
import { forwardEmail, fromNumber, replyText, twiml } from "@/lib/twilio/inbound";
import { validTwilioSignature } from "@/lib/twilio/signature";

/**
 * Twilio's incoming-message webhook for the notifications number (+971 50 830 5678).
 * Set in Twilio on Messaging Service "whatsapp_notifications_service" → Integration →
 * "Send a webhook" → https://<site>/api/whatsapp/inbound (POST).
 *
 *   TWILIO_AUTH_TOKEN        verifies the request really comes from Twilio (required)
 *   TWILIO_WEBHOOK_URL       optional: the exact URL set in Twilio, if it differs from the request's
 *   WHATSAPP_FORWARD_TO      who gets the forwarded messages (default LEAD_EMAIL_TO, hello@milkywayy.com)
 */
export const dynamic = "force-dynamic";

const xmlResponse = (body: string, status = 200) =>
  new Response(body, { status, headers: { "Content-Type": "text/xml; charset=utf-8" } });

export async function POST(req: NextRequest) {
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!token) {
    console.error("[whatsapp] TWILIO_AUTH_TOKEN is not set; inbound message ignored");
    return xmlResponse(twiml(), 503);
  }
  const form = await req.formData();
  const m: Record<string, string> = {};
  form.forEach((v, k) => {
    if (typeof v === "string") m[k] = v;
  });

  // Twilio signs the exact URL it was given; behind Vercel, rebuild it from the forwarded headers.
  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "";
  const urls = [`${proto}://${host}${req.nextUrl.pathname}${req.nextUrl.search}`];
  if (process.env.TWILIO_WEBHOOK_URL) urls.unshift(process.env.TWILIO_WEBHOOK_URL);
  if (!validTwilioSignature(req.headers.get("x-twilio-signature"), urls, m, token)) {
    console.warn("[whatsapp] rejected a request with a bad Twilio signature");
    return xmlResponse(twiml(), 403);
  }

  const from = fromNumber(m);
  if (!m.From?.startsWith("whatsapp:") || !from) return xmlResponse(twiml()); // not a WhatsApp message

  let chat = "";
  try {
    chat = (await getSiteSettings()).whatsapp.number;
  } catch (e) {
    console.error("[whatsapp] site settings unavailable; no auto-reply", e);
  }
  // One automatic reply per sender per 24 hours (de-duplicated in the database).
  const sha = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(from));
  const key = `wa-autoreply|${Buffer.from(sha).toString("hex").slice(0, 32)}`;
  const reply = chat ? await firstTime(key, 24 * 60) : false;

  after(async () => {
    const mail = forwardEmail(m, reply, chat || "971507263306");
    if (!process.env.RESEND_API_KEY)
      return console.warn("[whatsapp] RESEND_API_KEY not set; not forwarded");
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.LEAD_EMAIL_FROM || "Milkywayy website <onboarding@resend.dev>",
        to: [process.env.WHATSAPP_FORWARD_TO || process.env.LEAD_EMAIL_TO || "hello@milkywayy.com"],
        subject: mail.subject,
        text: mail.text,
      }),
    }).catch((e) => e as Error);
    if (res instanceof Error || !res.ok)
      console.error(
        "[whatsapp] forward email failed",
        res instanceof Error ? res.message : res.status,
      );
  });

  return xmlResponse(twiml(reply ? replyText(chat) : undefined));
}
