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
/** PAYMENTS_ENABLED=false switches card payments off even with keys set (launch runs without Stripe). */
export const stripeReady = () => process.env.PAYMENTS_ENABLED !== "false" && !!stripeKey();

/**
 * The publishable key for Embedded Checkout on our own page (phase 1, 27 Oct 2026). Same rule as the
 * secret key: a live one only on production. Without it, Pay now falls back to Stripe's hosted page.
 */
export function publishableKey() {
  const k = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? "";
  if (!k || !stripeKey()) return null;
  const production =
    process.env.VERCEL_ENV === "production" && process.env.NEXT_PUBLIC_SITE_ENV === "production";
  if (/^pk_live_/.test(k) && !production) return null;
  // Never mix modes: a test secret with a live publishable key (or the reverse) can't work.
  if (/^pk_live_/.test(k) !== /^(sk|rk)_live_/.test(stripeKey()!)) return null;
  return k;
}

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

/** One Stripe API call (form-encoded), throwing Stripe's message on failure. */
async function api<T>(
  path: string,
  body?: Record<string, unknown>,
  idem?: string,
  method?: string,
) {
  const key = stripeKey();
  if (!key) throw new Error("Stripe isn't set up here");
  const r = await fetch(`${API}${path}`, {
    method: method ?? (body ? "POST" : "GET"),
    headers: {
      Authorization: `Bearer ${key}`,
      ...(body ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
      ...(idem ? { "Idempotency-Key": idem } : {}),
    },
    body: body ? form(body).join("&") : undefined,
  });
  const out = (await r.json()) as T & {
    error?: { message?: string; code?: string; decline_code?: string };
  };
  if (!r.ok)
    throw Object.assign(
      new Error(`Stripe ${r.status}: ${out.error?.message ?? "request refused"}`),
      {
        code: out.error?.decline_code ?? out.error?.code,
      },
    );
  return out as T;
}

/**
 * A Checkout session for one invoice. "embedded" (our own /portal/pay page, needs the publishable key)
 * returns a client secret; "hosted" returns Stripe's page URL. With a customer, the company's saved card
 * is offered and a new one can be saved.
 */
export async function createCheckout(o: {
  invoiceId: string;
  number: string;
  amount: number;
  currency: string;
  email?: string | null;
  customer?: string | null;
  ui?: "embedded" | "hosted";
  /** Embedded: where Stripe sends the browser after paying ({CHECKOUT_SESSION_ID} is filled in). */
  returnUrl?: string;
  successUrl?: string;
  cancelUrl?: string;
}) {
  const embedded = o.ui === "embedded";
  const out = await api<{ id?: string; url?: string; client_secret?: string }>(
    "/checkout/sessions",
    {
      mode: "payment",
      client_reference_id: o.invoiceId,
      ...(embedded
        ? { ui_mode: "embedded", return_url: o.returnUrl }
        : { success_url: o.successUrl, cancel_url: o.cancelUrl }),
      ...(o.customer
        ? {
            customer: o.customer,
            saved_payment_method_options: { payment_method_save: "enabled" },
          }
        : { customer_email: o.email || undefined }),
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
    },
    // One session per invoice per minute (and per page type), however often the button is pressed.
    `inv-${o.invoiceId}-${embedded ? "e" : "h"}-${Math.floor(Date.now() / 60000)}`,
  );
  if (!out.id || (embedded ? !out.client_secret : !out.url)) throw new Error("Stripe: no session");
  return { id: out.id, url: out.url ?? null, clientSecret: out.client_secret ?? null };
}

export type CheckoutSession = {
  id: string;
  mode: "payment" | "setup";
  status: "open" | "complete" | "expired";
  payment_status: "paid" | "unpaid" | "no_payment_required";
  amount_total: number | null;
  currency: string | null;
  client_reference_id: string | null;
  customer: string | null;
  metadata?: Record<string, string>;
  setup_intent?: { id: string; payment_method?: PaymentMethod | null } | string | null;
};
export type PaymentMethod = {
  id: string;
  card?: { brand: string; last4: string; exp_month: number; exp_year: number };
};

export const getCheckout = (id: string) =>
  api<CheckoutSession>(
    `/checkout/sessions/${encodeURIComponent(id)}?expand[]=setup_intent.payment_method`,
  );

/** The company's Stripe customer (one per account), made the first time it's needed. */
export const createCustomer = (o: {
  accountId: string;
  name: string;
  email?: string | null;
  replacing?: string;
}) =>
  api<{ id: string }>(
    "/customers",
    { name: o.name, email: o.email || undefined, metadata: { account_id: o.accountId } },
    o.replacing ? `cust-${o.accountId}-${o.replacing}` : `cust-${o.accountId}`,
  );

/** Whether a stored customer still exists under this key (a test-mode id is unknown to live keys). */
export async function customerExists(id: string) {
  try {
    const c = await api<{ deleted?: boolean }>(`/customers/${encodeURIComponent(id)}`);
    return !c.deleted;
  } catch (e) {
    if (e instanceof Error && /^Stripe 404/.test(e.message)) return false;
    throw e;
  }
}

/** Save a card for later (Checkout in setup mode): on our page (embedded) or Stripe's. */
export async function createSetupCheckout(o: {
  customer: string;
  accountId: string;
  ui: "embedded" | "hosted";
  returnUrl: string;
  cancelUrl: string;
}) {
  const embedded = o.ui === "embedded";
  const out = await api<{ id: string; url?: string; client_secret?: string }>(
    "/checkout/sessions",
    {
      mode: "setup",
      currency: "aed",
      customer: o.customer,
      payment_method_types: { 0: "card" },
      metadata: { account_id: o.accountId, purpose: "save_card" },
      setup_intent_data: { metadata: { account_id: o.accountId } },
      ...(embedded
        ? { ui_mode: "embedded", return_url: o.returnUrl }
        : { success_url: o.returnUrl, cancel_url: o.cancelUrl }),
    },
  );
  return { id: out.id, url: out.url ?? null, clientSecret: out.client_secret ?? null };
}

export const getPaymentMethod = (id: string) =>
  api<PaymentMethod>(`/payment_methods/${encodeURIComponent(id)}`);

export const detachPaymentMethod = (id: string) =>
  api<PaymentMethod>(`/payment_methods/${encodeURIComponent(id)}/detach`, {});

/** "Visa •••• 4242 · 12/28" pieces from a card. */
export const cardOf = (pm: PaymentMethod | null | undefined) =>
  pm?.card
    ? {
        pm_id: pm.id,
        brand: pm.card.brand,
        last4: pm.card.last4,
        exp: `${String(pm.card.exp_month).padStart(2, "0")}/${String(pm.card.exp_year).slice(-2)}`,
      }
    : null;

export type PaymentIntent = {
  id: string;
  status: string;
  amount: number;
  currency: string;
  metadata?: Record<string, string>;
  last_payment_error?: { message?: string; decline_code?: string } | null;
};

/**
 * Charge the saved card for an invoice without the client present (automatic month-end payments).
 * Stripe declines come back as a thrown error with the decline message.
 */
export const chargeSavedCard = (o: {
  customer: string;
  pm: string;
  invoiceId: string;
  number: string;
  amount: number;
  currency: string;
  attempt: number;
}) =>
  api<PaymentIntent>(
    "/payment_intents",
    {
      amount: minor(o.amount),
      currency: o.currency.toLowerCase(),
      customer: o.customer,
      payment_method: o.pm,
      off_session: "true",
      confirm: "true",
      description: `Milkywayy invoice ${o.number}`,
      metadata: { invoice_id: o.invoiceId, invoice_number: o.number, autopay: "1" },
    },
    `autopay-${o.invoiceId}-${o.attempt}`,
  );

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

/**
 * Refund (part of) a Checkout payment (owner, 24 Oct 2026): the session's payment intent, the amount in
 * the minor unit, and our refund id in the metadata so the webhook can match it. One refund per id.
 */
export async function refundCheckout(o: {
  sessionId: string;
  amount: number;
  refundId: string;
  /** A retry after a failure needs a fresh idempotency key (Stripe replays the failure otherwise). */
  attempt?: string;
}) {
  const key = stripeKey();
  if (!key) throw new Error("Stripe isn't set up here");
  const auth = { Authorization: `Bearer ${key}` };
  // A saved-card payment is refunded by its PaymentIntent directly (phase 1).
  const session = o.sessionId.startsWith("pi_")
    ? { payment_intent: o.sessionId }
    : await (async () => {
        const s = await fetch(`${API}/checkout/sessions/${encodeURIComponent(o.sessionId)}`, {
          headers: auth,
        });
        const out = (await s.json()) as {
          payment_intent?: string | null;
          error?: { message?: string };
        };
        if (!s.ok || !out.payment_intent)
          throw new Error(
            `Stripe ${s.status}: ${out.error?.message ?? "no payment for that session"}`,
          );
        return out;
      })();
  const r = await fetch(`${API}/refunds`, {
    method: "POST",
    headers: {
      ...auth,
      "Content-Type": "application/x-www-form-urlencoded",
      "Idempotency-Key": `refund-${o.refundId}${o.attempt ? `-${o.attempt}` : ""}`,
    },
    body: form({
      payment_intent: session.payment_intent,
      amount: minor(o.amount),
      metadata: { refund_id: o.refundId },
    }).join("&"),
  });
  const out = (await r.json()) as { id?: string; status?: string; error?: { message?: string } };
  if (!r.ok || !out.id)
    throw new Error(`Stripe ${r.status}: ${out.error?.message ?? "refund refused"}`);
  return { id: out.id, status: out.status ?? "pending" };
}
