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
  if (/choose the package and its renewal date/.test(m))
    return { ok: false, error: "Choose the package and its renewal date." };
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
      notice: `Invoice ${i.number.trim()} added${emailed ? `, emailed ${emailed}` : ""}.`,
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
        { number: inv.number, amount: money(inv.currency, inv.amount), due: dateLabel(inv.due_on) },
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

export async function setOverride(
  account: string,
  key: string,
  amount: number | null,
): Promise<BillingResult> {
  try {
    const rpc = await portalAdminAction();
    await rpc("portal_admin_set_override", { p_account: account, p_key: key, p_amount: amount });
    revalidatePath(`/admin/accounts/${account}`);
    return { ok: true, notice: amount === null ? "Back to the card rate." : "Rate saved." };
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
  overage: { key: string; label: string; amount: number }[];
};

export async function savePackage(p: PackageInput): Promise<BillingResult> {
  if (!p.name.trim()) return { ok: false, error: "Give the package a name." };
  if (!(p.price >= 0)) return { ok: false, error: "Enter the monthly price." };
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
): Promise<BillingResult> {
  try {
    const rpc = await portalAdminAction();
    await rpc("portal_admin_set_plan", {
      p_account: account,
      p_mode: mode,
      p_package: pkg,
      p_started: started || null,
      p_renews: renews || null,
    });
    revalidatePath(`/admin/accounts/${account}`);
    return { ok: true, notice: mode === "payg" ? "Now pay as you go." : "Plan saved." };
  } catch (e) {
    return fail(e);
  }
}

export async function setSuggestions(enabled: boolean): Promise<BillingResult> {
  try {
    const rpc = await portalAdminAction();
    await rpc("portal_admin_set_suggestions", { p_enabled: enabled });
    refresh("/admin/billing/suggestions");
    return { ok: true, notice: enabled ? "Suggestions are on." : "Suggestions are off." };
  } catch (e) {
    return fail(e);
  }
}

export async function saveRule(r: {
  id?: string;
  package: string;
  lookback: number;
  threshold: number;
  minSaving: number;
  active: boolean;
}): Promise<BillingResult> {
  if (!r.package) return { ok: false, error: "Choose the package to suggest." };
  try {
    const rpc = await portalAdminAction();
    await rpc("portal_admin_save_rule", {
      p_id: r.id ?? null,
      p_package: r.package,
      p_lookback: r.lookback,
      p_threshold: r.threshold,
      p_min_saving: r.minSaving,
      p_active: r.active,
    });
    refresh("/admin/billing/suggestions");
    return { ok: true, notice: "Rule saved." };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteRule(id: string): Promise<BillingResult> {
  try {
    const rpc = await portalAdminAction();
    await rpc("portal_admin_delete_rule", { p_id: id });
    refresh("/admin/billing/suggestions");
    return { ok: true, notice: "Rule deleted." };
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
