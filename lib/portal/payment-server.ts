import { createCheckout, refundCheckout, stripeReady } from "@/lib/stripe";
import { portalAdminAs } from "./admin";
import { dateLabel, money } from "./billing";
import { projectLink, type MessageEvent, type ProjectInfo } from "./messages";
import { notifyBilling, notifyClients, type Recipient } from "./notify";
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

/** A Stripe Checkout page for an invoice; the webhook marks it paid. Null when Stripe is off. */
export async function checkoutFor(
  rpc: Rpc,
  inv: Pick<StageInvoice, "id" | "number" | "amount" | "currency">,
  o: { email?: string | null; successUrl: string; cancelUrl: string },
) {
  if (!stripeReady() || !inv.number) return null;
  const s = await createCheckout({
    invoiceId: inv.id,
    number: inv.number,
    amount: inv.amount,
    currency: inv.currency,
    email: o.email,
    successUrl: o.successUrl,
    cancelUrl: o.cancelUrl,
  });
  await rpc("portal_admin_set_stripe_session", { p_invoice: inv.id, p_session: s.id });
  return s.url;
}

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
  let payUrl: string | null = null;
  try {
    payUrl = await checkoutFor(o.rpc, invoice, {
      email: o.email,
      successUrl: `${pagePath(o.origin, o.type, o.ref)}?paid=1`,
      cancelUrl: `${pagePath(o.origin, o.type, o.ref)}?pay=1`,
    });
  } catch (e) {
    console.error("[payments] checkout:", e instanceof Error ? e.message : e);
  }
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
