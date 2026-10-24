"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { portalAdminAction } from "./admin";
import { originFrom } from "./invite";
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
