"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { getPropertyPricing } from "@/lib/data";
import { portalAdminAction } from "./admin";
import {
  clientPricing,
  estimate,
  estimateLines,
  normalizeServices,
  type BookingService,
  type Rates,
} from "./booking";
import { originFrom } from "./invite";
import { firstName, projectLink } from "./messages";
import { notifyPeople } from "./notify";
import { whenLabel } from "./when";
import type { Recipient } from "./notify";
import type { ProjectPayment } from "./payment-actions";
import { emailConfirmed, runRefunds, sendNewInvoices, type RefundRow } from "./payment-server";
import {
  quoteChange,
  type ChangeKind,
  type ChangeQuote,
  type ChangeReason,
  type PaymentTerms,
} from "./payments";

/**
 * Admin side of payment terms (owner, 24 Oct 2026): a client's term, payment and cancellation
 * settings, value packages, "Mark as paid / release files", cancellations with the fee shown (and
 * waived or changed before it's applied), and "Refund due" tasks.
 */
type Result = { ok: boolean; error?: string; notice?: string; quote?: ChangeQuote };

const fail = (e: unknown): Result => {
  const m = e instanceof Error ? e.message : String(e);
  console.error("[admin/payments]", m);
  if (/not allowed/.test(m))
    return { ok: false, error: "The portal admin key isn’t set up (PORTAL_ADMIN_SECRET)." };
  if (/set both/.test(m))
    return { ok: false, error: "Set both the allowance and the half-day cap." };
  if (/whole half-days/.test(m))
    return { ok: false, error: "Use 0 or more, and whole half-days for the cap." };
  if (/can't be changed/.test(m)) return { ok: false, error: "This project can’t be changed now." };
  if (/refund more/.test(m)) return { ok: false, error: "That refund is more than was paid." };
  if (/check constraint|violates/.test(m)) return { ok: false, error: "That value isn’t allowed." };
  return { ok: false, error: "Couldn’t save. Try again." };
};

export async function setPaymentTerms(account: string, terms: PaymentTerms): Promise<Result> {
  try {
    const rpc = await portalAdminAction();
    await rpc("portal_admin_set_payment_terms", { p_account: account, p_terms: terms });
    revalidatePath(`/admin/accounts/${account}`);
    revalidatePath("/portal", "layout");
    return { ok: true, notice: "Payment terms saved." };
  } catch (e) {
    return fail(e);
  }
}

export async function savePaymentSettings(s: {
  wio_link: string;
  cancel_free_hours: number;
  late_fee_pct: number;
  late_fee_min: number;
  work_keep_pct: number;
}): Promise<Result> {
  const wio = s.wio_link.trim();
  if (wio && !/^https:\/\/\S+$/.test(wio))
    return { ok: false, error: "The Wio link must start with https://" };
  try {
    const rpc = await portalAdminAction();
    await rpc("portal_admin_save_payment_settings", { p: { ...s, wio_link: wio } });
    revalidatePath("/admin/billing/settings");
    return { ok: true, notice: "Saved." };
  } catch (e) {
    return fail(e);
  }
}

export async function setPackageValue(
  packageId: string,
  allowance: number | null,
  cap: number | null,
  account?: string,
): Promise<Result> {
  try {
    const rpc = await portalAdminAction();
    await rpc("portal_admin_set_package_value", {
      p_package: packageId,
      p_allowance: allowance,
      p_cap: cap,
    });
    if (account) revalidatePath(`/admin/accounts/${account}`);
    revalidatePath("/admin/billing/packages");
    revalidatePath("/portal", "layout");
    return { ok: true, notice: "Package saved." };
  } catch (e) {
    return fail(e);
  }
}

const doneProject = (id: string, r: Result) => {
  revalidatePath(`/admin/projects/${id}`);
  revalidatePath("/admin/billing");
  return r;
};

/** "Mark as paid / release files" on a booking: its unpaid booking invoices paid, files unlocked. */
export async function markProjectPaid(projectId: string, releaseOnly = false): Promise<Result> {
  try {
    const rpc = await portalAdminAction();
    const out = await rpc<{ paid: number; account: string; recipients: Recipient[] }>(
      "portal_admin_mark_project_paid",
      { p_project: projectId, p_release_only: releaseOnly },
    );
    const origin = originFrom(await headers());
    if (out.paid > 0) await emailConfirmed(rpc, projectId, origin).catch(() => 0);
    return doneProject(projectId, {
      ok: true,
      notice: releaseOnly
        ? "Files released."
        : out.paid
          ? `Marked paid (${out.paid} invoice${out.paid === 1 ? "" : "s"}). Files released.`
          : "Nothing was unpaid. Files released.",
    });
  } catch (e) {
    return fail(e);
  }
}

export async function lockFiles(projectId: string): Promise<Result> {
  try {
    const rpc = await portalAdminAction();
    await rpc("portal_admin_lock_files", { p_project: projectId });
    return doneProject(projectId, { ok: true, notice: "Files follow payment again." });
  } catch (e) {
    return fail(e);
  }
}

type AdminChange = {
  reason: ChangeReason;
  waive?: boolean;
  fee?: number | null;
  /** Edits/avatars after work started: what Milkywayy keeps. */
  keep?: number | null;
  refundMethod?: "bank" | "wio";
  note?: string;
  date?: string;
  startTime?: string;
};

async function quoteAdmin(projectId: string, kind: ChangeKind, c: AdminChange) {
  const rpc = await portalAdminAction();
  const pay = await rpc<ProjectPayment>("portal_admin_project_payment", { p_project: projectId });
  const q = quoteChange({
    kind,
    type: pay.type,
    status: pay.status,
    start: pay.start,
    value: Number(pay.value),
    paid: pay.invoices
      .filter((i) => i.stage && i.status === "paid")
      .map((i) => ({ id: i.id, amount: i.amount, refunded: i.refunded, paid_via: i.paid_via })),
    reason: c.reason,
    onPackage: pay.on_package && pay.package_left != null,
    halfDaysLeft: pay.package_left,
    settings: pay.settings,
    keep: c.keep ?? null,
    waive: c.waive,
    feeOverride: c.fee ?? null,
  });
  return { rpc, pay, q };
}

export async function adminQuoteChange(
  projectId: string,
  kind: ChangeKind,
  c: AdminChange,
): Promise<Result> {
  try {
    const { q } = await quoteAdmin(projectId, kind, c);
    return { ok: true, quote: q };
  } catch (e) {
    return fail(e);
  }
}

/** Cancel or reschedule from the admin, with the fee as shown (waived or changed first if needed). */
export async function adminApplyChange(
  projectId: string,
  kind: ChangeKind,
  c: AdminChange,
): Promise<Result> {
  try {
    // Phase 1: an admin cancellation (Milkywayy's reason) always refunds in full.
    if (kind === "cancel" && c.reason === "admin") c = { ...c, waive: true, fee: null };
    const { rpc, q } = await quoteAdmin(projectId, kind, c);
    if (!q.allowed) return { ok: false, error: q.blocked };
    if (kind === "reschedule" && !c.date) return { ok: false, error: "Choose the new date." };
    const out = await rpc<{ refunds: RefundRow[]; charged: number; account: string }>(
      "portal_admin_apply_change",
      {
        p_project: projectId,
        p: {
          kind,
          reason: c.reason,
          fee: q.fee,
          waived: !!c.waive,
          half_days: q.halfDays,
          refunds: q.refunds.map((r) => ({
            invoice_id: r.invoice_id,
            amount: r.amount,
            method: c.refundMethod ?? "bank",
          })),
          note: c.note ?? "",
          by: "admin",
          ...(kind === "reschedule" ? { date: c.date, start_time: c.startTime || null } : {}),
        },
      },
    );
    const refunds = await runRefunds(rpc, out.refunds);
    await sendNewInvoices(rpc, projectId, originFrom(await headers()), "admin").catch(() => 0);
    const due = out.refunds.filter((r) => !r.stripe).reduce((n, r) => n + Number(r.amount), 0);
    return doneProject(projectId, {
      ok: true,
      notice: [
        kind === "cancel" ? "Cancelled." : "Rescheduled.",
        q.fee > 0 ? `Fee AED ${q.fee}.` : q.halfDays ? "1 half-day used." : "",
        refunds.sent ? `${refunds.sent} Stripe refund(s) sent.` : "",
        refunds.failed ? `${refunds.failed} Stripe refund(s) failed: see Refunds.` : "",
        due > 0 ? `Refund due: AED ${due} (Billing → Refunds).` : "",
        out.charged > 0 ? `AED ${out.charged} invoiced.` : "",
      ]
        .filter(Boolean)
        .join(" "),
    });
  } catch (e) {
    return fail(e);
  }
}

/** A bank/Wio refund has been sent: tick the task off. */
export async function refundDone(id: string): Promise<Result> {
  try {
    const rpc = await portalAdminAction();
    await rpc("portal_admin_refund_done", { p_refund: id });
    revalidatePath("/admin/billing/refunds");
    revalidatePath("/admin/billing");
    return { ok: true, notice: "Marked as refunded." };
  } catch (e) {
    return fail(e);
  }
}

/** Retry a failed Stripe refund. */
export async function retryStripeRefund(r: RefundRow): Promise<Result> {
  try {
    const rpc = await portalAdminAction();
    const out = await runRefunds(rpc, [r], true);
    revalidatePath("/admin/billing/refunds");
    return out.failed
      ? { ok: false, error: "Stripe refused it again. Check the Stripe dashboard." }
      : { ok: true, notice: "Sent to Stripe." };
  } catch (e) {
    return fail(e);
  }
}

/** After a delivery: email any invoice the delivery issued (the 50% balance). */
export async function emailIssuedInvoices(projectId: string) {
  try {
    const rpc = await portalAdminAction();
    return await sendNewInvoices(rpc, projectId, originFrom(await headers()), "admin");
  } catch (e) {
    console.error("[admin/payments] invoice email:", e instanceof Error ? e.message : e);
    return 0;
  }
}

export type UnpricedBooking = {
  id: string;
  ref: string;
  account_id: string;
  account: string;
  status: string;
  title: string;
  services: BookingService[] | null;
  terms: PaymentTerms;
  estimate: number | null;
  has_invoice: boolean;
};

/**
 * Phase 1 part 1 backfill (27 Oct 2026): bookings a teammate made without price access had no estimate
 * and no invoice. Prices each at the company's rates and, on 50% / 100% terms while it's still
 * requested or confirmed, issues the booking invoice (emailed to the company's billing people).
 * Delivered work is only priced (month-end and per-project drafts pick it up), never auto-invoiced.
 * `dry` lists what it would do.
 */
export async function backfillBookingInvoices(dry = true): Promise<Result & { rows?: string[] }> {
  try {
    const rpc = await portalAdminAction();
    const list = await rpc<UnpricedBooking[]>("portal_admin_unpriced_bookings", {});
    const pricing = await getPropertyPricing();
    const origin = originFrom(await headers());
    const rows: string[] = [];
    for (const b of list ?? []) {
      const rates = await rpc<Rates | null>("portal_admin_account_rates", {
        p_account: b.account_id,
      });
      const services = normalizeServices(b.services ?? []);
      const cp = clientPricing(pricing, rates);
      const est = b.estimate ?? (rates && services.length ? estimate(services, rates, cp) : null);
      const invoice =
        !b.has_invoice &&
        ["prepay", "split"].includes(b.terms) &&
        ["requested", "confirmed"].includes(b.status) &&
        !!est;
      rows.push(
        `${b.ref} · ${b.account} · ${b.status} · ${b.terms} · estimate ${est ?? "—"}${invoice ? " · issue invoice" : ""}`,
      );
      if (dry || est == null) continue;
      if (b.estimate == null)
        await rpc("portal_admin_set_estimate", { p_project: b.id, p_estimate: est });
      if (invoice && rates) {
        await rpc("portal_admin_booking_invoice", {
          p_project: b.id,
          p_lines: estimateLines(services, rates, cp)
            .filter((l) => l.amount != null && l.amount > 0)
            .map((l) => ({
              description: l.label,
              qty: l.qty,
              unit_price: Math.round((Number(l.amount) / l.qty) * 100) / 100,
            })),
          p_estimate: est,
        });
        await sendNewInvoices(rpc, b.id, origin, "backfill");
      }
    }
    if (!dry) revalidatePath("/admin/billing");
    return {
      ok: true,
      rows,
      notice: rows.length
        ? dry
          ? `${rows.length} booking${rows.length === 1 ? "" : "s"} to fix.`
          : `Fixed ${rows.length}.`
        : "Nothing to fix.",
    };
  } catch (e) {
    return fail(e);
  }
}

/** Per client: may they pay by bank transfer + receipt upload (phase 1; Stripe is the main way). */
export async function setBankTransfer(account: string, on: boolean): Promise<Result> {
  try {
    const rpc = await portalAdminAction();
    await rpc("portal_admin_set_bank_transfer", { p_account: account, p_on: on });
    revalidatePath(`/admin/accounts/${account}`);
    revalidatePath("/portal", "layout");
    return { ok: true, notice: on ? "Bank transfer allowed." : "Card only." };
  } catch (e) {
    return fail(e);
  }
}

/**
 * Propose another time for a requested shoot (phase 1): the client is emailed and sees Accept /
 * Decline on the shoot page. Accept confirms it; decline cancels with a full refund.
 */
export async function proposeTime(
  projectId: string,
  date: string,
  startTime: string,
  note: string,
): Promise<Result> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { ok: false, error: "Choose the date." };
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(startTime)) return { ok: false, error: "Choose a time." };
  try {
    const rpc = await portalAdminAction();
    const out = await rpc<{
      ref: string;
      title: string;
      recipients: { email: string; name?: string | null }[];
    }>("portal_admin_propose_time", {
      p_project: projectId,
      p_date: date,
      p_start: startTime,
      p_note: note.trim() || null,
    });
    const when = whenLabel(date, startTime);
    await notifyPeople({
      projectId,
      template: "time_proposed",
      recipients: out.recipients,
      subject: `New time proposed for ${out.ref}: ${when}`,
      lines: (name) => [
        `Hi ${firstName(name)},`,
        `Your preferred time for ${out.title} (${out.ref}) isn’t available. We can do ${when} instead.`,
        ...(note.trim() ? [note.trim()] : []),
        "Accept it on the shoot page and it’s confirmed. If it doesn’t suit you, decline and you get a full refund.",
      ],
      button: "Accept or decline",
      link: projectLink(originFrom(await headers()), out.ref),
      actor: "admin",
    });
    return doneProject(projectId, { ok: true, notice: `Proposed ${when}. The client is emailed.` });
  } catch (e) {
    return fail(e);
  }
}
