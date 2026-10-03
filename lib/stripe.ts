import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Stripe Checkout for "Pay now" on invoices (billing add-on, owner 4 Oct 2026), with the REST API
 * and no SDK. Server only.
 *
 *   STRIPE_SECRET_KEY       sk_test_… on previews; a live key only on production
 *   STRIPE_WEBHOOK_SECRET   whsec_… for /api/stripe/webhook
 */
const API = "https://api.stripe.com/v1";

/** A live key is refused anywhere but production, so previews can only ever take test payments. */
export function stripeKey() {
  const k = process.env.STRIPE_SECRET_KEY ?? "";
  if (!k) return null;
  const production =
    process.env.VERCEL_ENV === "production" && process.env.NEXT_PUBLIC_SITE_ENV === "production";
  if (/^(sk|rk)_live_/.test(k) && !production) return null;
  return k;
}
export const stripeReady = () => !!stripeKey();

/** Stripe's form encoding, nested keys included (line_items[0][price_data][currency]=aed). */
function form(obj: Record<string, unknown>, prefix = ""): string[] {
  return Object.entries(obj).flatMap(([k, v]) => {
    const key = prefix ? `${prefix}[${k}]` : k;
    if (v === undefined || v === null) return [];
    if (typeof v === "object") return form(v as Record<string, unknown>, key);
    return [`${encodeURIComponent(key)}=${encodeURIComponent(String(v))}`];
  });
}

/** Amounts in the currency's minor unit (AED and USD both have 2 decimals). */
export const minor = (amount: number) => Math.round(Number(amount) * 100);

export async function createCheckout(o: {
  invoiceId: string;
  number: string;
  amount: number;
  currency: string;
  email?: string | null;
  successUrl: string;
  cancelUrl: string;
}) {
  const key = stripeKey();
  if (!key) throw new Error("Stripe isn't set up here");
  const body = form({
    mode: "payment",
    client_reference_id: o.invoiceId,
    success_url: o.successUrl,
    cancel_url: o.cancelUrl,
    customer_email: o.email || undefined,
    metadata: { invoice_id: o.invoiceId, invoice_number: o.number },
    payment_intent_data: { metadata: { invoice_id: o.invoiceId, invoice_number: o.number } },
    line_items: {
      0: {
        quantity: 1,
        price_data: {
          currency: o.currency.toLowerCase(),
          unit_amount: minor(o.amount),
          product_data: { name: `Milkywayy invoice ${o.number}` },
        },
      },
    },
  }).join("&");
  const r = await fetch(`${API}/checkout/sessions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/x-www-form-urlencoded",
      // One session per invoice per minute, however often the button is pressed.
      "Idempotency-Key": `inv-${o.invoiceId}-${Math.floor(Date.now() / 60000)}`,
    },
    body,
  });
  const out = (await r.json()) as { id?: string; url?: string; error?: { message?: string } };
  if (!r.ok || !out.id || !out.url)
    throw new Error(`Stripe ${r.status}: ${out.error?.message ?? "no session"}`);
  return { id: out.id, url: out.url };
}

export type StripeEvent = {
  id: string;
  type: string;
  data: { object: Record<string, unknown> };
};

/**
 * Checks the Stripe-Signature header (t=…,v1=…): HMAC-SHA256 of "t.payload" with the endpoint's
 * secret, within 5 minutes. Returns the event, or null if it isn't genuine.
 */
export function verifyWebhook(
  payload: string,
  header: string | null,
  secret: string | undefined,
  now = Date.now(),
): StripeEvent | null {
  if (!header || !secret) return null;
  const parts = header.split(",").map((p) => p.split("=") as [string, string]);
  const t = parts.find(([k]) => k === "t")?.[1];
  const sigs = parts.filter(([k]) => k === "v1").map(([, v]) => v);
  if (!t || !sigs.length || Math.abs(now / 1000 - Number(t)) > 300) return null;
  const expected = Buffer.from(
    createHmac("sha256", secret).update(`${t}.${payload}`).digest("hex"),
  );
  const ok = sigs.some((s) => {
    const b = Buffer.from(s);
    return b.length === expected.length && timingSafeEqual(b, expected);
  });
  if (!ok) return null;
  try {
    return JSON.parse(payload) as StripeEvent;
  } catch {
    return null;
  }
}

/** For tests: a valid signature header for a payload. */
export const signWebhook = (payload: string, secret: string, t = Math.floor(Date.now() / 1000)) =>
  `t=${t},v1=${createHmac("sha256", secret).update(`${t}.${payload}`).digest("hex")}`;
