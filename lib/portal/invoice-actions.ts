"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { portalAdminAction, portalAdminSystem } from "./admin";
import { dateLabel, money, type InvoiceLine } from "./billing";
import { originFrom } from "./invite";
import { alertMilkywayy, notifyBilling, type Recipient } from "./notify";

/**
 * Invoice drafts, review and approval (owner, 10 Oct 2026). Every invoice is a draft first;
 * Milkywayy edits and approves it; approved month-end invoices publish on the month's last day
 * (packages billed in advance on the 1st), one-off invoices on approval. Publishing shows it in
 * the client's dashboard and sends the "New invoice" email: the only billing email.
 */
export type InvoiceResult = { ok: boolean; error?: string; notice?: string; id?: string };

type Published = {
  id: string;
  account: string;
  number: string | null;
  recipients: Recipient[];
  published?: boolean;
  publish_on?: string;
};

/** Our database messages for 22023 are written for people; anything else stays generic. */
const fail = (e: unknown): InvoiceResult => {
  const err = e as { message?: string; code?: string };
  console.error("[admin/invoices]", err?.message);
  if (err?.code === "22023" && err.message) return { ok: false, error: sentence(err.message) };
  if (/not allowed/.test(err?.message ?? ""))
    return { ok: false, error: "The portal admin key isn’t set up." };
  return { ok: false, error: "Couldn’t save. Try again." };
};
const sentence = (m: string) =>
  m.charAt(0).toUpperCase() + m.slice(1) + (/[.!?]$/.test(m) ? "" : ".");
const refresh = (id?: string) => {
  revalidatePath("/admin/billing/queue");
  if (id) revalidatePath(`/admin/billing/invoices/${id}`);
};

/** The "New invoice" email for an invoice that was just published. */
export async function emailPublished(p: Published, origin: string, actor = "admin") {
  if (!p.recipients?.length) return 0;
  const rpc = actor === "cron" ? portalAdminSystem : await portalAdminAction();
  const inv = await rpc<{ amount: number; currency: string; due_on: string } | null>(
    "portal_admin_invoice",
    { p_id: p.id },
  );
  if (!inv) return 0;
  return notifyBilling(
    p.account,
    "invoice_issued",
    {
      number: p.number ?? "",
      amount: money(inv.currency, Number(inv.amount)),
      due: dateLabel(inv.due_on),
    },
    p.recipients,
    `${origin}/portal/billing`,
    actor,
  );
}

export async function saveDraft(
  id: string,
  d: {
    lines: InvoiceLine[];
    note: string;
    due: string;
    pdfSource: "generated" | "ledger";
    pdfKey?: string | null;
  },
): Promise<InvoiceResult> {
  if (!d.lines.length && d.pdfSource === "generated")
    return { ok: false, error: "Add at least one line." };
  try {
    const rpc = await portalAdminAction();
    await rpc("portal_admin_save_draft", {
      p_id: id,
      p_lines: d.lines.map((l) => ({
        description: l.description,
        qty: Number(l.qty),
        unit_price: Number(l.unit_price),
        ...(l.line_item_id ? { line_item_id: l.line_item_id } : {}),
        ...(l.kind ? { kind: l.kind } : {}),
      })),
      p_note: d.note,
      p_due: d.due,
      p_pdf_source: d.pdfSource,
      p_pdf_key: d.pdfKey ?? null,
    });
    refresh(id);
    return { ok: true, notice: "Saved." };
  } catch (e) {
    return fail(e);
  }
}

export async function refreshDraft(id: string): Promise<InvoiceResult> {
  try {
    const rpc = await portalAdminAction();
    await rpc("portal_admin_refresh_draft", { p_id: id });
    refresh(id);
    return { ok: true, notice: "Rebuilt from the latest activity." };
  } catch (e) {
    return fail(e);
  }
}

export async function approveInvoice(id: string, publishNow: boolean): Promise<InvoiceResult> {
  try {
    const rpc = await portalAdminAction();
    const out = await rpc<Published>("portal_admin_approve_invoice", {
      p_id: id,
      p_publish_now: publishNow,
    });
    let emailed = 0;
    if (out.published) emailed = await emailPublished(out, originFrom(await headers()));
    refresh(id);
    if (out.account) revalidatePath(`/admin/accounts/${out.account}`);
    return {
      ok: true,
      notice: out.published
        ? `Approved and published${out.number ? ` as ${out.number}` : ""}${emailed ? `; emailed ${emailed}` : ""}.`
        : `Approved. It publishes on ${dateLabel(out.publish_on)}.`,
    };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteDraft(id: string): Promise<InvoiceResult> {
  try {
    const rpc = await portalAdminAction();
    await rpc("portal_admin_delete_invoice", { p_id: id });
    refresh();
    return { ok: true, notice: "Draft deleted. Its items are free for the next invoice." };
  } catch (e) {
    return fail(e);
  }
}

/** "Make this month's drafts now" (the cron does it daily from the 25th). */
export async function generateDrafts(): Promise<InvoiceResult> {
  try {
    const rpc = await portalAdminAction();
    const out = await rpc<{ created: number; note?: string }>("portal_admin_generate_drafts", {});
    refresh();
    if (out.note) return { ok: true, notice: "Month-end drafts are made from the 25th." };
    if (out.created)
      await alertMilkywayy(
        `${out.created} invoice draft${out.created === 1 ? "" : "s"} ready for review`,
        ["Month-end invoice drafts are ready. Review, edit and approve them in the invoice queue."],
        `${originFrom(await headers())}/admin/billing/queue`,
      );
    return {
      ok: true,
      notice: out.created ? `${out.created} draft(s) made.` : "Nothing new to draft.",
    };
  } catch (e) {
    return fail(e);
  }
}
