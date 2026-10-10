"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { deleteObject, downloadUrl, r2Ready } from "@/lib/r2";
import { portalAdminAction } from "./admin";
import { dateLabel, money, type Invoice } from "./billing";
import { originFrom } from "./invite";
import { notifyBilling, type Recipient } from "./notify";
import { planUpload, type ServerPlan } from "./upload-plan";

/**
 * Admin → Billing (CLIENT_PORTAL_GUIDE §7.3): invoices (PDF from Milkywayy Ledger), rate card and
 * per-client rates, packages and plans, suggestions, and line items on projects. Owner only; every
 * change goes through the logged portal_admin_* functions.
 */
export type BillingResult = {
  ok: boolean;
  error?: string;
  notice?: string;
  id?: string;
  url?: string;
};

const fail = (e: unknown): BillingResult => {
  const m = e instanceof Error ? e.message : String(e);
  console.error("[admin/billing]", m);
  if (/not allowed/.test(m)) return { ok: false, error: "The portal admin key isn’t set up." };
  if (/duplicate key|unique/.test(m))
    return { ok: false, error: "That invoice number is already used for this client." };
  if (/due_on >= issued_on|check constraint "invoices_check"/.test(m))
    return { ok: false, error: "The due date can’t be before the invoice date." };
  if (/a client is on this package/.test(m))
    return { ok: false, error: "A client is on this package. Move them to another plan first." };
  if (/choose the package and its (renewal|start) date/.test(m))
    return { ok: false, error: "Choose the package and its start date." };
  if (/each inclusion needs/.test(m))
    return { ok: false, error: "Each inclusion needs a kind and a quantity above 0." };
  if (/no rate for that kind/.test(m))
    return { ok: false, error: "There’s no rate for that yet. Enter a price." };
  return { ok: false, error: "Couldn’t save. Try again." };
};
const refresh = (...paths: string[]) => {
  for (const p of ["/admin/billing", ...paths]) revalidatePath(p);
};

/** One request (no multipart): invoice PDFs are small. */
const MAX_PDF = 16 * 1024 * 1024;

/** Upload the invoice PDF straight to R2 (invoices/<account>/…). */
export async function startInvoiceUpload(
  account: string,
  name: string,
  size: number,
): Promise<ServerPlan> {
  await portalAdminAction();
  if (!/\.pdf$/i.test(name)) return { ok: false, error: "Choose the invoice PDF." };
  if (size > MAX_PDF) return { ok: false, error: "PDFs can be up to 16 MB." };
  if (!/^[0-9a-f-]{36}$/.test(account)) return { ok: false, error: "Choose the client first." };
  try {
    return await planUpload(`invoices/${account}`, name, size);
  } catch (e) {
    return { ok: false, error: fail(e).error! };
  }
}

export type NewInvoice = {
  account: string;
  number: string;
  issued: string;
  due: string;
  amount: number;
  currency: "AED" | "USD";
  status: "due" | "paid" | "overdue";
  pdfKey: string | null;
  note?: string;
  notify: boolean;
  /** The month this invoice bills (its statement), "YYYY-MM-01". */
  statementMonth?: string | null;
};

export async function createInvoice(i: NewInvoice): Promise<BillingResult> {
  if (!i.account) return { ok: false, error: "Choose the client." };
  if (!i.number.trim()) return { ok: false, error: "Enter the invoice number." };
  if (!i.issued || !i.due) return { ok: false, error: "Enter the invoice and due dates." };
  if (!(i.amount >= 0)) return { ok: false, error: "Enter the amount." };
  if (!i.pdfKey) return { ok: false, error: "Upload the PDF first." };
  try {
    const rpc = await portalAdminAction();
    const out = await rpc<{ id: string; recipients: Recipient[] }>("portal_admin_create_invoice", {
      p_account: i.account,
      p_number: i.number.trim(),
      p_issued: i.issued,
      p_due: i.due,
      p_amount: i.amount,
      p_currency: i.currency,
      p_status: i.status,
      p_pdf_key: i.pdfKey,
      p_note: i.note?.trim() || null,
      p_statement_month: i.statementMonth || null,
    });
    let emailed = 0;
    if (i.notify && out.recipients.length)
      emailed = await notifyBilling(
        i.account,
        "invoice_issued",
        { number: i.number.trim(), amount: money(i.currency, i.amount), due: dateLabel(i.due) },
        out.recipients,
        `${originFrom(await headers())}/portal/billing`,
      );
    refresh(`/admin/accounts/${i.account}`);
    return {
      ok: true,
      id: out.id,
      notice: `Draft added to the invoice queue${emailed ? `, emailed ${emailed}` : ""}.`,
    };
  } catch (e) {
    return fail(e);
  }
}

async function findInvoice(id: string) {
  const rpc = await portalAdminAction();
  const all = await rpc<(Invoice & { account_name: string })[]>("portal_admin_invoices", {});
  return { rpc, inv: all.find((x) => x.id === id) };
}

export async function setInvoiceStatus(
  id: string,
  status: Invoice["status"],
  notify = true,
): Promise<BillingResult> {
  try {
    const { rpc, inv } = await findInvoice(id);
    if (!inv) return { ok: false, error: "That invoice isn’t there any more." };
    const out = await rpc<{ account: string; recipients: Recipient[] }>(
      "portal_admin_set_invoice_status",
      {
        p_id: id,
        p_status: status,
      },
    );
    let emailed = 0;
    if (notify && out.recipients.length)
      emailed = await notifyBilling(
        out.account,
        "payment_received",
        {
          number: inv.number ?? "",
          amount: money(inv.currency, inv.amount),
          due: dateLabel(inv.due_on),
        },
        out.recipients,
        `${originFrom(await headers())}/portal/billing`,
      );
    refresh(`/admin/accounts/${out.account}`);
    return { ok: true, notice: `Marked ${status}${emailed ? `, emailed ${emailed}` : ""}.` };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteInvoice(id: string): Promise<BillingResult> {
  try {
    const rpc = await portalAdminAction();
    const key = await rpc<string | null>("portal_admin_delete_invoice", { p_id: id });
    if (key && r2Ready()) await deleteObject(key).catch(() => undefined);
    refresh();
    return { ok: true, notice: "Invoice deleted." };
  } catch (e) {
    return fail(e);
  }
}

export async function adminInvoiceLink(id: string): Promise<BillingResult> {
  try {
    const { inv } = await findInvoice(id);
    if (!inv?.pdf_key) return { ok: false, error: "No PDF on this invoice." };
    if (!r2Ready()) return { ok: false, error: "File storage (R2) isn’t set up here." };
    return { ok: true, url: downloadUrl(inv.pdf_key, `${inv.number}.pdf`) };
  } catch (e) {
    return fail(e);
  }
}

// ---------- rates ----------

export async function saveRate(r: {
  key: string;
  label: string;
  unit: string;
  aed: number | null;
  usd: number | null;
  sort: number;
}): Promise<BillingResult> {
  if (!/^[a-z][a-z0-9_]{1,39}$/.test(r.key))
    return { ok: false, error: "Key: lowercase letters, numbers and _." };
  try {
    const rpc = await portalAdminAction();
    await rpc("portal_admin_save_rate", {
      p_key: r.key,
      p_label: r.label,
      p_unit: r.unit,
      p_aed: r.aed,
      p_usd: r.usd,
      p_sort: r.sort,
    });
    refresh("/admin/billing/rates");
    return { ok: true, notice: `${r.label} saved.` };
  } catch (e) {
    return fail(e);
  }
}

// ---------- packages, plans, suggestions ----------

export type PackageInput = {
  id?: string;
  account: string | null;
  name: string;
  price: number;
  currency: "AED" | "USD";
  inclusions: { key: string; label: string; qty: number }[];
  overage: { key: string; label: string; amount: number; amount_usd?: number | null }[];
  /** Templates only: the USD price beside the AED one. */
  priceUsd?: number | null;
  /** Off the monthly price for a 6-month commitment. */
  discountPct?: number;
  /** Templates only: a candidate for package suggestions. */
  suggest?: boolean;
};

export async function savePackage(p: PackageInput): Promise<BillingResult> {
  if (!p.name.trim()) return { ok: false, error: "Give the package a name." };
  if (!(p.price >= 0)) return { ok: false, error: "Enter the monthly price." };
  if (!p.account && !(Number(p.priceUsd) >= 0))
    return { ok: false, error: "Templates need a USD price too." };
  const pct = p.discountPct ?? 10;
  if (!(pct >= 0 && pct <= 50)) return { ok: false, error: "The 6-month discount is 0–50%." };
  try {
    const rpc = await portalAdminAction();
    const id = await rpc<string>("portal_admin_save_package", {
      p_id: p.id ?? null,
      p_account: p.account,
      p_name: p.name.trim(),
      p_price: p.price,
      p_currency: p.currency,
      p_inclusions: p.inclusions,
      p_overage: p.overage,
      p_visible: false,
      p_price_usd: p.account ? null : p.priceUsd,
      p_discount_pct: pct,
      p_suggest: p.suggest ?? true,
    });
    refresh("/admin/billing/packages", ...(p.account ? [`/admin/accounts/${p.account}`] : []));
    return { ok: true, id, notice: `${p.name.trim()} saved.` };
  } catch (e) {
    return fail(e);
  }
}

export async function deletePackage(id: string): Promise<BillingResult> {
  try {
    const rpc = await portalAdminAction();
    await rpc("portal_admin_delete_package", { p_id: id });
    refresh("/admin/billing/packages");
    return { ok: true, notice: "Package deleted." };
  } catch (e) {
    return fail(e);
  }
}

export async function setPlan(
  account: string,
  mode: "payg" | "package",
  pkg: string | null,
  started: string | null,
  renews: string | null,
  term: 1 | 6 = 1,
  ends: string | null = null,
): Promise<BillingResult> {
  try {
    const rpc = await portalAdminAction();
    await rpc("portal_admin_set_plan", {
      p_account: account,
      p_mode: mode,
      p_package: pkg,
      p_started: started || null,
      p_renews: renews || null,
      p_term: term,
      p_ends: term === 6 ? ends || null : null,
    });
    revalidatePath(`/admin/accounts/${account}`);
    return { ok: true, notice: mode === "payg" ? "Now pay as you go." : "Plan saved." };
  } catch (e) {
    return fail(e);
  }
}

export type BillingSettings = {
  suggestions_enabled: boolean;
  min_saving_aed: number;
  min_saving_usd: number;
  vat_registered: boolean;
  bank_account_name: string | null;
  bank_name: string | null;
  bank_iban: string | null;
  bank_swift: string | null;
  invoice_prefix?: string;
  next_invoice_no?: number;
  default_due_days?: number;
  company_name?: string | null;
  company_address?: string | null;
  company_trn?: string | null;
  company_email?: string | null;
};

/** Suggestions (switch, minimum saving), VAT, bank details: whichever fields are given. */
export async function saveBillingSettings(p: Partial<BillingSettings>): Promise<BillingResult> {
  if (
    p.bank_iban &&
    !/^[A-Z]{2}\d{2}[A-Z0-9]{8,30}$/.test(p.bank_iban.replace(/\s/g, "").toUpperCase())
  )
    return { ok: false, error: "Check the IBAN (e.g. AE07 0331 2345 6789 0123 456)." };
  if (
    p.bank_swift &&
    !/^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(p.bank_swift.trim().toUpperCase())
  )
    return { ok: false, error: "Check the SWIFT code (8 or 11 characters)." };
  for (const k of ["min_saving_aed", "min_saving_usd"] as const)
    if (k in p && !(Number(p[k]) >= 0)) return { ok: false, error: "Enter the minimum saving." };
  if (p.company_trn && !/^\d{15}$/.test(p.company_trn.trim()))
    return { ok: false, error: "The TRN is 15 digits." };
  if (p.invoice_prefix && !/^[A-Z0-9-]{1,12}$/.test(p.invoice_prefix.trim().toUpperCase()))
    return { ok: false, error: "The prefix can use letters, numbers and dashes (12 at most)." };
  if ("next_invoice_no" in p && !(Number(p.next_invoice_no) >= 1))
    return { ok: false, error: "The next invoice number must be 1 or more." };
  if (
    "default_due_days" in p &&
    !(Number(p.default_due_days) >= 0 && Number(p.default_due_days) <= 90)
  )
    return { ok: false, error: "Due after: 0 to 90 days." };
  try {
    const rpc = await portalAdminAction();
    await rpc("portal_admin_save_billing_settings", { p });
    refresh("/admin/billing/suggestions", "/admin/billing/settings");
    return { ok: true, notice: "Saved." };
  } catch (e) {
    return fail(e);
  }
}

/** Kept for the switch on the Suggestions page. */
export async function setSuggestions(enabled: boolean): Promise<BillingResult> {
  const r = await saveBillingSettings({ suggestions_enabled: enabled });
  return r.ok ? { ok: true, notice: enabled ? "Suggestions are on." : "Suggestions are off." } : r;
}

/** Per client: a pinned offer (replaces the templates in their suggestion), and card payments. */
export async function setClientBilling(
  account: string,
  p: { pinned_package_id?: string | null; pay_online?: boolean | null },
): Promise<BillingResult> {
  try {
    const rpc = await portalAdminAction();
    await rpc("portal_admin_set_client_billing", { p_account: account, p });
    revalidatePath(`/admin/accounts/${account}`);
    return { ok: true, notice: "Saved." };
  } catch (e) {
    return fail(e);
  }
}

export type Statement = {
  month: string;
  currency: "AED" | "USD";
  mode: "payg" | "package";
  subtotal: number;
  vat: number;
  total: number;
  frozen_at: string;
};

/** A client's frozen statement for a month (to prefill an invoice), or null. */
export async function statementFor(account: string, month: string): Promise<Statement | null> {
  if (!/^[0-9a-f-]{36}$/.test(account) || !/^\d{4}-\d{2}-01$/.test(month)) return null;
  try {
    const rpc = await portalAdminAction();
    return await rpc<Statement | null>("portal_admin_statement", {
      p_account: account,
      p_month: month,
    });
  } catch {
    return null;
  }
}

/** Freeze (or re-freeze) a month's statements: one client, or everyone. */
export async function freezeStatements(
  account: string | null,
  month: string,
  replace = false,
): Promise<BillingResult> {
  try {
    const rpc = await portalAdminAction();
    const n = await rpc<number>("portal_admin_freeze_statements", {
      p_month: month,
      p_account: account,
      p_replace: replace,
    });
    if (account) revalidatePath(`/admin/accounts/${account}`);
    return {
      ok: true,
      notice: n ? `${n} statement${n === 1 ? "" : "s"} frozen.` : "Already frozen (nothing new).",
    };
  } catch (e) {
    const m = e instanceof Error ? e.message : "";
    if (/only complete months/.test(m))
      return { ok: false, error: "Only finished months can be frozen." };
    return fail(e);
  }
}

/** The client's transfer proof, as a short-lived link. */
export async function proofLink(id: string): Promise<BillingResult> {
  try {
    const rpc = await portalAdminAction();
    const p = await rpc<{ key: string; filename: string } | null>("portal_admin_proof", {
      p_proof: id,
    });
    if (!p) return { ok: false, error: "That proof isn’t there any more." };
    if (!r2Ready()) return { ok: false, error: "File storage (R2) isn’t set up here." };
    return { ok: true, url: downloadUrl(p.key, p.filename, 300) };
  } catch (e) {
    return fail(e);
  }
}

/** Bank transfer: confirm (Paid, "Payment received") or reject with a reason (emailed). */
export async function decidePayment(
  proof: string,
  confirm: boolean,
  reason = "",
): Promise<BillingResult> {
  if (!confirm && reason.trim().length < 3)
    return { ok: false, error: "Say why (the client sees it)." };
  try {
    const rpc = await portalAdminAction();
    const out = await rpc<{
      account: string;
      number: string;
      amount: number;
      currency: string;
      due_on: string;
      event: "payment_received" | "payment_rejected";
      reason: string | null;
      recipients: Recipient[];
    }>("portal_admin_decide_payment", {
      p_proof: proof,
      p_confirm: confirm,
      p_reason: confirm ? null : reason.trim(),
    });
    let emailed = 0;
    if (out.recipients.length)
      emailed = await notifyBilling(
        out.account,
        out.event,
        {
          number: out.number,
          amount: money(out.currency, out.amount),
          due: dateLabel(out.due_on),
          reason: out.reason,
        },
        out.recipients,
        `${originFrom(await headers())}/portal/billing`,
      );
    refresh(`/admin/accounts/${out.account}`);
    return {
      ok: true,
      notice: `${confirm ? "Confirmed: marked Paid" : "Rejected"}${emailed ? `, emailed ${emailed}` : ""}.`,
    };
  } catch (e) {
    return fail(e);
  }
}

export async function hideSuggestions(account: string, hide: boolean): Promise<BillingResult> {
  try {
    const rpc = await portalAdminAction();
    await rpc("portal_admin_hide_suggestions", { p_account: account, p_hide: hide });
    revalidatePath(`/admin/accounts/${account}`);
    return {
      ok: true,
      notice: hide ? "Suggestions hidden for this client." : "Suggestions allowed.",
    };
  } catch (e) {
    return fail(e);
  }
}

// ---------- line items on a project ----------

export async function addLineItem(
  project: string,
  kind: string,
  description: string,
  qty: number,
  unitPrice: number | null,
): Promise<BillingResult> {
  if (!(qty > 0)) return { ok: false, error: "Enter how many." };
  try {
    const rpc = await portalAdminAction();
    await rpc("portal_admin_add_line_item", {
      p_project: project,
      p_kind: kind,
      p_description: description.trim() || null,
      p_qty: qty,
      p_unit_price: unitPrice,
    });
    revalidatePath(`/admin/projects/${project}`);
    return { ok: true, notice: "Added." };
  } catch (e) {
    return fail(e);
  }
}

export async function removeLineItem(project: string, id: string): Promise<BillingResult> {
  try {
    const rpc = await portalAdminAction();
    await rpc("portal_admin_remove_line_item", { p_id: id });
    revalidatePath(`/admin/projects/${project}`);
    return { ok: true, notice: "Removed." };
  } catch (e) {
    return fail(e);
  }
}

/** Turnaround texts shown in the clients' request forms (owner, 10 Oct 2026). */
export type TurnaroundRow = { key: string; label: string; text: string };
export async function saveTurnaround(items: Record<string, string>): Promise<BillingResult> {
  for (const [, v] of Object.entries(items))
    if (!v.trim() || v.trim().length > 120)
      return { ok: false, error: "Each turnaround needs a short text (120 characters at most)." };
  try {
    const rpc = await portalAdminAction();
    await rpc("portal_admin_set_turnaround", { p_items: items });
    refresh("/admin/billing/settings");
    return { ok: true, notice: "Saved. Clients see it in the request forms." };
  } catch (e) {
    return fail(e);
  }
}
