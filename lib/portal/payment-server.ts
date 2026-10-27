import {
  cardOf,
  createCheckout,
  createCustomer,
  getCheckout,
  publishableKey,
  refundCheckout,
  stripeReady,
  type CheckoutSession,
} from "@/lib/stripe";
import { portalAdminAs } from "./admin";
import { dateLabel, money } from "./billing";
import { projectLink, type MessageEvent, type ProjectInfo } from "./messages";
import { alertMilkywayy, notifyBilling, notifyClients, type Recipient } from "./notify";
import type { Project } from "./projects";

/**
 * Payments on the server (owner, 24 Oct 2026): booking invoices, Stripe Checkout and refunds, and the
 * emails that go with them. Every database step runs through the gated portal_admin_* functions as
 * `actor` (the client's email, "stripe", or the admin), so it's logged.
 */
type Rpc = ReturnType<typeof portalAdminAs>;

const PAGE = { shoot: "shoots", edit: "editing", avatar: "avatars" } as const;
/** The project's own page (the /portal/p link redirects and would drop ?paid=1). */
export const pagePath = (origin: string, type: keyof typeof PAGE, ref: string) =>
  `${origin}/portal/${PAGE[type] ?? "shoots"}/${encodeURIComponent(ref)}`;

/**
 * The company's rates for pricing a booking on the server (phase 1, 27 Oct 2026). A teammate without
 * price access gets no rates from my_booking_options, which left their bookings with no estimate and so
 * no invoice. Uses the client's own view when it has the rates, else the gated admin function; the
 * rates stay on the server either way.
 */
export async function companyRates<R>(accountId: string, own: R | null, actor: string) {
  if (own) return own;
  try {
    return (await portalAdminAs(actor)<R | null>("portal_admin_account_rates", {
      p_account: accountId,
    })) as R | null;
  } catch (e) {
    console.error("[payments] company rates:", e instanceof Error ? e.message : e);
    return null;
  }
}

export type StageInvoice = {
  id: string;
  number: string | null;
  amount: number;
  currency: string;
  status: string;
  stage: "full" | "deposit" | "balance" | "fee" | null;
};

/** Email every invoice of the project nobody has been told about yet ("New invoice …"). */
export async function sendNewInvoices(rpc: Rpc, projectId: string, origin: string, actor: string) {
  const list = await rpc<
    (StageInvoice & { account: string; due_on: string; recipients: Recipient[] })[]
  >("portal_admin_unsent_invoices", { p_project: projectId });
  let sent = 0;
  for (const i of list ?? [])
    sent += await notifyBilling(
      i.account,
      "invoice_issued",
      { number: i.number ?? "", amount: money(i.currency, i.amount), due: dateLabel(i.due_on) },
      i.recipients,
      `${origin}/portal/billing`,
      actor,
    );
  return sent;
}

/** Our own checkout page for an invoice (phase 1, 27 Oct 2026): Stripe Embedded Checkout inside it. */
export const payPath = (invoiceId: string) => `/portal/pay/${invoiceId}`;

/**
 * Right after a booking (shoot, edit or avatar video) is created: record the booking terms, issue the
 * 100% / 50% invoice by the client's term, email it, and (Stripe on) return the payment page.
 */
export async function afterBooking(o: {
  rpc: Rpc;
  projectId: string;
  ref: string;
  type: "shoot" | "edit" | "avatar";
  lines: { description: string; qty: number; unit_price: number }[];
  estimate: number | null;
  email?: string | null;
  origin: string;
  actor: string;
}): Promise<{ invoice: StageInvoice | null; payUrl: string | null }> {
  let invoice: StageInvoice | null = null;
  try {
    invoice = await o.rpc<StageInvoice | null>("portal_admin_booking_invoice", {
      p_project: o.projectId,
      p_lines: o.lines,
      p_estimate: o.estimate,
    });
  } catch (e) {
    // The booking stands; Milkywayy issues the invoice by hand.
    console.error("[payments] booking invoice:", e instanceof Error ? e.message : e);
    return { invoice: null, payUrl: null };
  }
  if (!invoice) return { invoice: null, payUrl: null };
  await sendNewInvoices(o.rpc, o.projectId, o.origin, o.actor).catch((e) =>
    console.error("[payments] invoice email:", e),
  );
  // Stripe on: our own checkout page (/portal/pay/…), where the session is made on load.
  const payUrl = stripeReady() && invoice.number ? payPath(invoice.id) : null;
  return { invoice, payUrl };
}

/** "Booking confirmed" to the client, once a payment confirmed it. */
export async function emailConfirmed(rpc: Rpc, projectId: string, origin: string) {
  const d = await rpc<{ project: Project }>("portal_admin_project", { p_id: projectId });
  const p = d.project;
  if (p.status !== "confirmed") return 0;
  const recipients = await rpc<Recipient[]>("portal_admin_recipients", {
    p_id: projectId,
    p_event: "booking_confirmed",
  });
  const info: ProjectInfo = {
    ref: p.ref,
    title: p.title,
    type: p.type,
    status: p.status,
    status_note: p.status_note,
    shoot_date: p.shoot_date,
    slot: p.slot,
    meta: p.meta,
  };
  return notifyClients(p.id, "booking_confirmed" as MessageEvent, info, recipients ?? [], {
    link: projectLink(origin, p.ref),
    actor: "stripe",
  });
}

export type RefundRow = { id: string; amount: number; stripe: boolean; session: string | null };

/**
 * Stripe refunds go out straight away (the webhook confirms them); bank / Wio ones stay as
 * "Refund due" for the admin. Returns how many went to Stripe and how many failed.
 */
export async function runRefunds(rpc: Rpc, refunds: RefundRow[], retry = false) {
  let sent = 0;
  let failed = 0;
  for (const r of refunds) {
    if (!r.stripe || !r.session) continue;
    try {
      const out = await refundCheckout({
        sessionId: r.session,
        amount: r.amount,
        refundId: r.id,
        attempt: retry ? String(Date.now()) : undefined,
      });
      await rpc("portal_admin_refund_result", {
        p_refund: r.id,
        p_stripe_id: out.id,
        p_status: out.status,
      });
      sent++;
    } catch (e) {
      failed++;
      const m = e instanceof Error ? e.message : String(e);
      console.error("[payments] refund:", r.id, m);
      await rpc("portal_admin_refund_result", {
        p_refund: r.id,
        p_stripe_id: null,
        p_status: "failed",
        p_error: m.slice(0, 300),
      }).catch(() => {});
    }
  }
  return { sent, failed };
}

/* ---------- phase 1 (27 Oct 2026): checkout on our site, saved cards ---------- */

type Paid = {
  already: boolean;
  account: string;
  project_id?: string | null;
  number?: string;
  amount?: number;
  currency?: string;
  due_on?: string;
  recipients: Recipient[];
};

/** The company's Stripe customer, made the first time (so cards can be saved and offered again). */
export async function customerFor(
  rpc: Rpc,
  accountId: string,
  name: string,
  email?: string | null,
) {
  const c = await rpc<{ customer_id: string } | null>("portal_admin_stripe_customer", {
    p_account: accountId,
  });
  if (c?.customer_id) return c.customer_id;
  const made = await createCustomer({ accountId, name, email });
  await rpc("portal_admin_set_stripe_customer", {
    p_account: accountId,
    p: { customer_id: made.id },
  });
  return made.id;
}

/**
 * A Checkout session for an invoice on our pay page: embedded with the publishable key, else Stripe's
 * hosted page. `customer` (company payers) offers and can save the company card; a teammate paying
 * with their own card pays as themselves.
 */
export async function startCheckout(
  rpc: Rpc,
  inv: { id: string; number: string; amount: number; currency: string },
  o: { origin: string; email?: string | null; customer?: string | null; back: string },
) {
  const pk = publishableKey();
  const s = await createCheckout({
    invoiceId: inv.id,
    number: inv.number,
    amount: inv.amount,
    currency: inv.currency,
    email: o.email,
    customer: o.customer,
    ui: pk ? "embedded" : "hosted",
    returnUrl: `${o.origin}${payPath(inv.id)}/done?session_id={CHECKOUT_SESSION_ID}`,
    successUrl: `${o.origin}${payPath(inv.id)}/done?session_id={CHECKOUT_SESSION_ID}`,
    cancelUrl: o.back,
  });
  await rpc("portal_admin_set_stripe_session", { p_invoice: inv.id, p_session: s.id });
  return { publishableKey: pk, clientSecret: s.clientSecret, url: s.url };
}

/**
 * A paid Checkout session (the webhook, or the return page if it gets there first): marks the invoice
 * paid in the database (which checks the session, amount and currency), then "Payment received" to the
 * company's billing people and, for a booking, a note to Milkywayy to confirm it. Safe to run twice.
 */
export async function recordCheckoutPaid(rpc: Rpc, s: CheckoutSession, origin: string) {
  const invoice = s.client_reference_id ?? s.metadata?.invoice_id;
  if ((s.mode && s.mode !== "payment") || s.payment_status !== "paid" || !invoice) return null;
  const out = await rpc<Paid>("portal_admin_stripe_paid", {
    p_invoice: invoice,
    p_session: s.id,
    p_amount_minor: s.amount_total ?? -1,
    p_currency: s.currency ?? "",
  });
  await afterPaid(rpc, out, origin);
  return out;
}

/** Emails after any card payment: the receipt, and "confirm this booking" to Milkywayy. */
export async function afterPaid(rpc: Rpc, out: Paid, origin: string) {
  if (out.already) return;
  if (out.recipients.length)
    await notifyBilling(
      out.account,
      "payment_received",
      {
        number: out.number!,
        amount: money(out.currency!, out.amount!),
        due: dateLabel(out.due_on),
      },
      out.recipients,
      `${origin}/portal/billing`,
      "stripe",
    ).catch((e) => console.error("[payments] receipt email:", e));
  if (out.project_id) {
    const d = await rpc<{ project: Project }>("portal_admin_project", { p_id: out.project_id });
    const p = d.project;
    if (p.type === "shoot" && p.status === "requested")
      await alertMilkywayy(
        `Paid, confirm the booking: ${p.ref}`,
        [
          `${p.ref} ${p.title} is paid (${out.number}, ${money(out.currency!, out.amount!)}).`,
          `Preferred: ${p.shoot_date ?? "—"}${p.meta?.booking?.start_time ? ` · ${p.meta.booking.start_time}` : ""}.`,
          "Confirm it, or propose another time. Declining or cancelling refunds the card in full.",
        ],
        `${origin}/admin/projects/${p.id}`,
      ).catch((e) => console.error("[payments] confirm alert:", e));
  }
}

/** A finished "save a card" Checkout: store the card (brand, last 4, expiry) for the company. */
export async function recordCardSaved(rpc: Rpc, s: CheckoutSession, accountId?: string) {
  const account = accountId ?? s.metadata?.account_id;
  if (s.mode !== "setup" || s.status !== "complete" || !account) return null;
  const si = typeof s.setup_intent === "object" ? s.setup_intent : null;
  const card = cardOf(si?.payment_method ?? null);
  if (!card) return null;
  await rpc("portal_admin_set_stripe_customer", {
    p_account: account,
    p: { customer_id: s.customer, ...card },
  });
  return card;
}

/** Look a session up at Stripe (the return page doesn't trust the browser's word that it's paid). */
export const checkoutSession = (id: string) => getCheckout(id);
