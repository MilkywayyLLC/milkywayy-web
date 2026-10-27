"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import {
  detachPaymentMethod,
  publishableKey,
  createSetupCheckout,
  stripeReady,
} from "@/lib/stripe";
import { can } from "./access";
import { portalAdminAs } from "./admin";
import { requireAccount } from "./auth";
import { dateLabel, money } from "./billing";
import { originFrom } from "./invite";
import { firstName } from "./messages";
import { notifyMilkywayy, notifyPeople } from "./notify";
import {
  checkoutSession,
  customerFor,
  emailBookingRequest,
  pagePath,
  recordCardSaved,
  recordCheckoutPaid,
  runRefunds,
  startCheckout,
  type RefundRow,
} from "./payment-server";
import { quoteChange } from "./payments";
import type { ProjectPayment } from "./payment-actions";

/**
 * Card payments on our own site (phase 1, 27 Oct 2026): the /portal/pay page, saving a card,
 * automatic payments, a teammate sending a booking to the company, and the client's answer to a new
 * time Milkywayy proposed. Every database step goes through the gated portal_admin_* functions as the
 * signed-in person, after checking what they may see.
 */
type Result = { ok: boolean; error?: string; notice?: string };

export type PayView = {
  id: string;
  account_id: string;
  account: string;
  number: string;
  amount: number;
  currency: string;
  status: string;
  stage: string | null;
  unpaid: boolean;
  payment_state: string | null;
  billing: boolean;
  bank_transfer: boolean;
  customer_id: string | null;
  project: {
    id: string;
    ref: string;
    type: "shoot" | "edit" | "avatar";
    title: string;
    status: string;
    shoot_date: string | null;
    start_time: string | null;
    estimate: number;
  } | null;
};

async function me() {
  const { db, user, current } = await requireAccount("/portal");
  const actor = `client:${user.email ?? user.id}`;
  return { db, user, current, actor, rpc: portalAdminAs(actor) };
}

/** The invoice as this person may pay it (billing people, or the teammate who booked it). */
export async function payView(invoiceId: string) {
  if (!/^[0-9a-f-]{36}$/.test(invoiceId)) return null;
  const { user, rpc } = await me();
  return rpc<PayView | null>("portal_admin_pay_view", { p_invoice: invoiceId, p_user: user.id });
}

/** Opens Stripe for the pay page: a client secret (embedded) or Stripe's page URL (no publishable key). */
export async function startPayment(
  invoiceId: string,
): Promise<Result & { clientSecret?: string | null; url?: string | null; pk?: string | null }> {
  if (!stripeReady()) return { ok: false, error: "Card payments aren’t switched on yet." };
  const { user, current, rpc } = await me();
  const inv = await rpc<PayView | null>("portal_admin_pay_view", {
    p_invoice: invoiceId,
    p_user: user.id,
  });
  if (!inv) return { ok: false, error: "That invoice isn’t yours to pay." };
  if (!inv.unpaid) return { ok: false, error: "That invoice is already paid." };
  const origin = originFrom(await headers());
  try {
    // Billing people pay as the company (its saved card is offered); a teammate pays as themselves.
    const customer = inv.billing
      ? await customerFor(rpc, inv.account_id, current.account.name, user.email)
      : null;
    const s = await startCheckout(rpc, inv, {
      origin,
      email: user.email,
      customer,
      back: inv.project
        ? pagePath(origin, inv.project.type, inv.project.ref)
        : `${origin}/portal/billing`,
    });
    return { ok: true, clientSecret: s.clientSecret, url: s.url, pk: s.publishableKey };
  } catch (e) {
    console.error("[pay] start:", e instanceof Error ? e.message : e);
    return { ok: false, error: "Couldn’t open the payment form. Try again in a minute." };
  }
}

/**
 * The return page: asks Stripe whether the session is paid (never the browser's word). The webhook is
 * the source of truth (owner, 27 Oct 2026), so a paid session shows "Confirming payment…" until it
 * lands; `record` (a fallback the page calls after a while) records it here instead.
 */
export async function finishPayment(invoiceId: string, sessionId: string, record = false) {
  const { user, rpc } = await me();
  const inv = await rpc<PayView | null>("portal_admin_pay_view", {
    p_invoice: invoiceId,
    p_user: user.id,
  });
  if (!inv) return { state: "missing" as const, inv: null };
  if (!inv.unpaid) return { state: "paid" as const, inv };
  if (!/^cs_[A-Za-z0-9_]+$/.test(sessionId)) return { state: "open" as const, inv };
  try {
    const s = await checkoutSession(sessionId);
    if (s.client_reference_id !== invoiceId) return { state: "open" as const, inv };
    if (s.payment_status === "paid") {
      if (!record) return { state: "confirming" as const, inv };
      await recordCheckoutPaid(rpc, s, originFrom(await headers()));
      revalidatePath("/portal", "layout");
      return { state: "paid" as const, inv };
    }
    return { state: s.status === "complete" ? ("processing" as const) : ("open" as const), inv };
  } catch (e) {
    console.error("[pay] finish:", e instanceof Error ? e.message : e);
    return { state: "processing" as const, inv };
  }
}

/** Teammate: "Send to company for payment". Owner/admins get an email; the bell shows the invoice. */
export async function sendToCompany(projectId: string): Promise<Result> {
  const { db, user, rpc } = await me();
  const { data: profile } = await db
    .from("profiles")
    .select("full_name")
    .eq("user_id", user.id)
    .maybeSingle();
  const by = profile?.full_name || user.email || "A teammate";
  try {
    const out = await rpc<{
      ref: string;
      title: string;
      account: string;
      number: string;
      amount: number;
      currency: string;
      due_on: string;
      recipients: { email: string; name?: string | null }[];
    }>("portal_admin_send_to_company", {
      p_project: projectId,
      p_user: user.id,
      p_by: by,
    });
    const origin = originFrom(await headers());
    // A booking held for payment goes through now (unchanged for the teammate: Milkywayy is told).
    await rpc("portal_admin_release_booking", {
      p_project: projectId,
      p_why: `Sent to the company for payment (${out.number}). Request sent.`,
    });
    await emailBookingRequest(rpc, projectId, origin, [
      `${by} sent it to the company to pay (${out.number}, ${money(out.currency, out.amount)}).`,
    ]);
    await notifyPeople({
      projectId,
      template: "pay_requested",
      recipients: out.recipients,
      subject: `${by} sent ${out.ref} for payment: ${money(out.currency, out.amount)}`,
      lines: (name) => [
        `Hi ${firstName(name)},`,
        `${by} booked ${out.title} (${out.ref}) and sent it to you for payment.`,
        `Invoice ${out.number}: ${money(out.currency, out.amount)}, due ${dateLabel(out.due_on)}. We’ll confirm the date once it’s paid.`,
      ],
      button: "Pay now",
      link: `${origin}/portal/pay/${await invoiceOf(rpc, user.id, projectId)}`,
      actor: `client:${user.email ?? user.id}`,
    });
    revalidatePath("/portal", "layout");
    return { ok: true, notice: "Sent to the company for payment." };
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    console.error("[pay] send to company:", m);
    return {
      ok: false,
      error: /nothing to pay/.test(m)
        ? "There’s nothing to pay on this booking."
        : "Couldn’t send it. Try again.",
    };
  }
}

/** The booker discards their unpaid draft: the invoice is voided and the booking is gone. */
export async function discardDraft(projectId: string): Promise<Result> {
  const { db } = await me();
  const { error } = await db.rpc("discard_booking_draft", { p_project: projectId });
  if (error) {
    console.error("[pay] discard:", error.message);
    return {
      ok: false,
      error: /only an unpaid draft/.test(error.message)
        ? "This booking is already paid or sent, so it can’t be discarded here."
        : "Couldn’t discard it. Try again.",
    };
  }
  revalidatePath("/portal", "layout");
  return { ok: true, notice: "Booking discarded." };
}

async function invoiceOf(rpc: ReturnType<typeof portalAdminAs>, _user: string, projectId: string) {
  const pay = await rpc<ProjectPayment>("portal_admin_project_payment", { p_project: projectId });
  return pay.invoices.find((i) => i.stage && i.status !== "paid")?.id ?? "";
}

/* ---------- saved card and automatic payments (billing people) ---------- */

async function billingMe() {
  const m = await me();
  if (!can(m.current, "billing")) throw new Error("no billing access");
  return m;
}

/** "Save a card": Checkout in setup mode, on our page (embedded) or Stripe's. */
export async function startCardSetup(): Promise<
  Result & { clientSecret?: string | null; url?: string | null; pk?: string | null }
> {
  if (!stripeReady()) return { ok: false, error: "Card payments aren’t switched on yet." };
  try {
    const { user, current, rpc } = await billingMe();
    const customer = await customerFor(rpc, current.account.id, current.account.name, user.email);
    const origin = originFrom(await headers());
    const pk = publishableKey();
    const s = await createSetupCheckout({
      customer,
      accountId: current.account.id,
      ui: pk ? "embedded" : "hosted",
      returnUrl: `${origin}/portal/billing/card?session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${origin}/portal/billing`,
    });
    return { ok: true, clientSecret: s.clientSecret, url: s.url, pk };
  } catch (e) {
    console.error("[pay] card setup:", e instanceof Error ? e.message : e);
    return { ok: false, error: "Couldn’t open the card form. Try again." };
  }
}

/** Back from saving a card: check it at Stripe and store brand / last 4. */
export async function finishCardSetup(sessionId: string) {
  if (!/^cs_[A-Za-z0-9_]+$/.test(sessionId)) return null;
  const { current, rpc } = await billingMe();
  const s = await checkoutSession(sessionId);
  if (s.metadata?.account_id !== current.account.id) return null;
  const card = await recordCardSaved(rpc, s, current.account.id);
  revalidatePath("/portal/billing");
  return card;
}

export async function removeCard(): Promise<Result> {
  try {
    const { current, rpc } = await billingMe();
    const c = await rpc<{ pm_id: string | null } | null>("portal_admin_stripe_customer", {
      p_account: current.account.id,
    });
    if (c?.pm_id) await detachPaymentMethod(c.pm_id).catch(() => null);
    await rpc("portal_admin_set_stripe_customer", {
      p_account: current.account.id,
      p: { clear_card: true },
    });
    revalidatePath("/portal/billing");
    return { ok: true, notice: "Card removed. Automatic payments are off." };
  } catch (e) {
    console.error("[pay] remove card:", e instanceof Error ? e.message : e);
    return { ok: false, error: "Couldn’t remove the card. Try again." };
  }
}

export async function setAutopay(on: boolean): Promise<Result> {
  try {
    const { user, current, rpc } = await billingMe();
    const c = await rpc<{ pm_id: string | null } | null>("portal_admin_stripe_customer", {
      p_account: current.account.id,
    });
    if (on && !c?.pm_id) return { ok: false, error: "Save a card first." };
    await rpc("portal_admin_set_stripe_customer", {
      p_account: current.account.id,
      p: { autopay: on, by: user.email ?? user.id },
    });
    revalidatePath("/portal/billing");
    return {
      ok: true,
      notice: on
        ? "Month-end invoices will be paid with this card when they’re due."
        : "Automatic payments are off.",
    };
  } catch (e) {
    console.error("[pay] autopay:", e instanceof Error ? e.message : e);
    return { ok: false, error: "Couldn’t save that. Try again." };
  }
}

/* ---------- a new time proposed by Milkywayy ---------- */

async function shootFor(projectId: string) {
  const m = await me();
  const { data: p } = await m.db
    .from("projects")
    .select("id, ref, title, status, meta")
    .eq("id", projectId)
    .maybeSingle();
  if (!p || !can(m.current, "shoots")) throw new Error("no access");
  return { ...m, p };
}

export async function acceptProposal(projectId: string): Promise<Result> {
  try {
    const { user, current, rpc, p } = await shootFor(projectId);
    const out = await rpc<{ ref: string; date: string; start_time: string }>(
      "portal_admin_accept_proposal",
      { p_project: projectId, p_by: user.email ?? "Client" },
    );
    await notifyMilkywayy(
      projectId,
      "booking_changed",
      `New time accepted: ${current.account.name} · ${out.ref}`,
      [
        `${current.account.name} accepted ${out.date} · ${out.start_time} for ${p.ref} ${p.title}. It’s confirmed.`,
      ],
      `${originFrom(await headers())}/admin/projects/${projectId}`,
    ).catch(() => null);
    revalidatePath("/portal", "layout");
    return { ok: true, notice: "Confirmed for the new time." };
  } catch (e) {
    console.error("[pay] accept proposal:", e instanceof Error ? e.message : e);
    return { ok: false, error: "Couldn’t accept it. Refresh and try again." };
  }
}

/** Declining the proposed time cancels the booking with a full refund (card refunds go out at once). */
export async function declineProposal(projectId: string): Promise<Result> {
  try {
    const { user, current, rpc, p } = await shootFor(projectId);
    if (!(p.meta as { proposal?: unknown })?.proposal)
      return { ok: false, error: "There’s no new time to decline." };
    const pay = await rpc<ProjectPayment>("portal_admin_project_payment", { p_project: projectId });
    const q = quoteChange({
      kind: "cancel",
      type: pay.type,
      status: pay.status,
      start: pay.start,
      value: Number(pay.value),
      paid: pay.invoices
        .filter((i) => i.stage && i.status === "paid")
        .map((i) => ({ id: i.id, amount: i.amount, refunded: i.refunded, paid_via: i.paid_via })),
      reason: "admin",
      waive: true,
      settings: pay.settings,
    });
    const out = await rpc<{ refunds: RefundRow[] }>("portal_admin_apply_change", {
      p_project: projectId,
      p: {
        kind: "cancel",
        reason: "admin",
        fee: 0,
        waived: true,
        half_days: 0,
        refunds: q.refunds.map((r) => ({
          invoice_id: r.invoice_id,
          amount: r.amount,
          method: r.stripe ? "stripe" : "bank",
        })),
        note: "Client declined the proposed time",
        by: "client",
        by_name: user.email,
      },
    });
    const refunds = await runRefunds(rpc, out.refunds);
    await notifyMilkywayy(
      projectId,
      "booking_cancelled",
      `Proposed time declined: ${current.account.name} · ${p.ref}`,
      [
        `${current.account.name} declined the new time for ${p.ref} ${p.title}. It’s cancelled with a full refund.`,
        ...(refunds.failed
          ? [`${refunds.failed} Stripe refund(s) failed: check Billing → Refunds.`]
          : []),
        ...(out.refunds.some((r) => !r.stripe) ? ["A bank refund is due: Billing → Refunds."] : []),
      ],
      `${originFrom(await headers())}/admin/projects/${projectId}`,
    ).catch(() => null);
    revalidatePath("/portal", "layout");
    return {
      ok: true,
      notice: q.refund > 0 ? "Cancelled. Your full refund is on its way." : "Cancelled.",
    };
  } catch (e) {
    console.error("[pay] decline proposal:", e instanceof Error ? e.message : e);
    return { ok: false, error: "Couldn’t cancel it. Try again or message us." };
  }
}
