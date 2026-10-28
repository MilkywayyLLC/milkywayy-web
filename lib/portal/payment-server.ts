import {
  createCheckout,
  createCustomer,
  customerExists,
  getCheckout,
  publishableKey,
  refundCheckout,
  stripeReady,
  type CheckoutSession,
} from "@/lib/stripe";
import { getPropertyPricing } from "@/lib/data";
import { portalAdminAs } from "./admin";
import { dateLabel, money } from "./billing";
import { SERVICE_LABEL, serviceSummary, type BookingService, type Slot } from "./booking";
import { projectLink, type MessageEvent, type ProjectInfo } from "./messages";
import {
  alertMilkywayy,
  notifyBilling,
  notifyClients,
  notifyMilkywayy,
  type Recipient,
} from "./notify";
import type { Project } from "./projects";
import { whenLabel } from "./when";

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
  stage: "full" | "deposit" | "balance" | "fee" | "adjustment" | null;
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
 * A shoot is then held as "Awaiting payment" (owner, 27 Oct 2026): a draft only the booker sees, with
 * no emails, until it's paid or a bank receipt is uploaded (`held`).
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
}): Promise<{ invoice: StageInvoice | null; payUrl: string | null; held: boolean }> {
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
    return { invoice: null, payUrl: null, held: false };
  }
  if (!invoice) return { invoice: null, payUrl: null, held: false };
  // Covered in full by account credit (28 Oct 2026): already paid, nothing to hold or pay.
  if (invoice.status === "paid") return { invoice: null, payUrl: null, held: false };
  const held =
    o.type === "shoot" &&
    (await o
      .rpc<boolean>("portal_admin_hold_booking", { p_project: o.projectId })
      .catch(
        (e) => (console.error("[payments] hold:", e instanceof Error ? e.message : e), false),
      ));
  if (!held)
    await sendNewInvoices(o.rpc, o.projectId, o.origin, o.actor).catch((e) =>
      console.error("[payments] invoice email:", e),
    );
  // Stripe on: our own checkout page (/portal/pay/…), where the session is made on load.
  const payUrl = stripeReady() && invoice.number ? payPath(invoice.id) : null;
  return { invoice, payUrl, held: !!held };
}

/**
 * "New booking request" to Milkywayy for a held booking, once it's released (paid, receipt uploaded,
 * or sent to the company). Goes once: the database claims it. `extra` says how it was released.
 */
export async function emailBookingRequest(
  rpc: Rpc,
  projectId: string,
  origin: string,
  extra: string[],
) {
  const claimed = await rpc<boolean>("portal_admin_claim_request_email", {
    p_project: projectId,
  }).catch((e) => (console.error("[payments] claim request:", e), false));
  if (!claimed) return false;
  const d = await rpc<{ project: Project; account: { name: string; currency: string } | null }>(
    "portal_admin_project",
    { p_id: projectId },
  );
  const p = d.project;
  const b = (p.meta?.booking ?? {}) as {
    slot?: Slot;
    start_time?: string | null;
    services?: BookingService[];
    estimate?: number | null;
    location?: { address?: string; unit?: string };
  };
  const pricing = await getPropertyPricing();
  const name = d.account?.name ?? "A client";
  await notifyMilkywayy(
    p.id,
    "booking_requested",
    `New booking request: ${name} · ${p.shoot_date ?? ""}`,
    [
      `${name} asked for a shoot on ${whenLabel(p.shoot_date ?? "", b.start_time ?? null, b.slot)}.`,
      `Where: ${b.location?.address ?? p.title}${b.location?.unit ? ` · ${b.location.unit}` : ""}`,
      ...(b.services ?? []).map(
        (s) => `${SERVICE_LABEL[s.service]}: ${serviceSummary(s, pricing)}`,
      ),
      ...(b.estimate != null && d.account
        ? [`Estimate at their rates: ${d.account.currency} ${b.estimate.toLocaleString("en-US")}`]
        : []),
      ...extra,
      "Confirm the date and time in the admin, or propose another time.",
    ],
    `${origin}/admin/projects/${p.id}`,
  ).catch((e) => console.error("[payments] booking request email:", e));
  return true;
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

/* ---------- phase 1 (27 Oct 2026): checkout on our site ---------- */

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

/** The company's Stripe customer, made the first time (payments and receipts sit on it). */
export async function customerFor(
  rpc: Rpc,
  accountId: string,
  name: string,
  email?: string | null,
) {
  const c = await rpc<{ customer_id: string } | null>("portal_admin_stripe_customer", {
    p_account: accountId,
  });
  if (c?.customer_id && (await customerExists(c.customer_id))) return c.customer_id;
  // None yet, or the stored one is gone (deleted, or made with test keys before live): a new one,
  // and the old saved card goes with it.
  const made = await createCustomer({
    accountId,
    name,
    email,
    replacing: c?.customer_id ?? undefined,
  });
  await rpc("portal_admin_set_stripe_customer", {
    p_account: accountId,
    p: c?.customer_id ? { customer_id: made.id, clear_card: true } : { customer_id: made.id },
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
    // A held booking goes through now: the full request, with the payment, instead of the short note.
    if (
      await emailBookingRequest(rpc, out.project_id, origin, [
        `Paid by card: ${out.number}, ${money(out.currency!, out.amount!)}. Declining or cancelling refunds it in full.`,
      ])
    )
      return;
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

/** Look a session up at Stripe (the return page doesn't trust the browser's word that it's paid). */
export const checkoutSession = (id: string) => getCheckout(id);
