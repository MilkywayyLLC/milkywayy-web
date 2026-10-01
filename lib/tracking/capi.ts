import { createHash } from "node:crypto";

/**
 * Meta Conversions API (guide §13): the server copy of Lead and Schedule. `event_id` is the
 * lead's MW reference, the same id the browser Pixel sends, so Meta counts each one once.
 * Email and phone are normalised and SHA-256 hashed; nothing is sent without the visitor's
 * consent. Needs NEXT_PUBLIC_META_PIXEL_ID + META_CAPI_TOKEN; in test mode, also
 * META_TEST_EVENT_CODE (events then show only under Test events in Events Manager).
 */
export type CapiInput = {
  event: "Lead" | "Schedule";
  eventId: string;
  url: string;
  email?: string;
  /** E.164, e.g. +971501234567 */
  phone?: string;
  ip?: string;
  userAgent?: string;
  fbp?: string;
  fbc?: string;
  custom?: Record<string, unknown>;
};

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

export function capiEvent(i: CapiInput, now = Date.now()) {
  const user: Record<string, unknown> = {};
  if (i.email) user.em = [sha256(i.email.trim().toLowerCase())];
  if (i.phone) user.ph = [sha256(i.phone.replace(/\D/g, ""))];
  if (i.ip) user.client_ip_address = i.ip;
  if (i.userAgent) user.client_user_agent = i.userAgent;
  if (i.fbp) user.fbp = i.fbp;
  if (i.fbc) user.fbc = i.fbc;
  return {
    event_name: i.event,
    event_time: Math.floor(now / 1000),
    event_id: i.eventId,
    action_source: "website",
    event_source_url: i.url,
    user_data: user,
    ...(i.custom ? { custom_data: i.custom } : {}),
  };
}

function settings() {
  const isProd = process.env.NEXT_PUBLIC_SITE_ENV === "production";
  const mode = process.env.NEXT_PUBLIC_TRACKING || (isProd ? "on" : "off");
  const pixel = process.env.NEXT_PUBLIC_META_PIXEL_ID;
  const token = process.env.META_CAPI_TOKEN;
  const testCode = process.env.META_TEST_EVENT_CODE;
  if (mode === "off" || !pixel || !token) return null;
  if (mode === "test" && !testCode) return null;
  // The test code only in test mode: live events must never be routed to Test events.
  return { pixel, token, testCode: mode === "test" ? testCode : undefined };
}

/** Meta's answer, without anything secret: what test mode shows in the /api/lead response. */
export type CapiResult =
  | { sent: false; reason: string }
  | { sent: true; ok: boolean; status: number; events_received?: number; error?: string };

export const trackingMode = () =>
  process.env.NEXT_PUBLIC_TRACKING ||
  (process.env.NEXT_PUBLIC_SITE_ENV === "production" ? "on" : "off");

export async function sendCapi(i: CapiInput): Promise<CapiResult> {
  const s = settings();
  if (!s) return { sent: false, reason: "tracking off, or pixel/token/test code missing" };
  try {
    const res = await fetch(
      `https://graph.facebook.com/v21.0/${s.pixel}/events?access_token=${encodeURIComponent(s.token)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          data: [capiEvent(i)],
          ...(s.testCode ? { test_event_code: s.testCode } : {}),
        }),
      },
    );
    const body = (await res.json().catch(() => ({}))) as {
      events_received?: number;
      error?: { message?: string };
    };
    if (!res.ok)
      console.error(`[capi] ${i.event} ${i.eventId}: ${res.status} ${body.error?.message ?? ""}`);
    return {
      sent: true,
      ok: res.ok,
      status: res.status,
      events_received: body.events_received,
      error: body.error?.message,
    };
  } catch (err) {
    console.error(`[capi] ${i.event} ${i.eventId}: failed`, err);
    return { sent: true, ok: false, status: 0, error: "request failed" };
  }
}
