"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { portalAdminAction } from "./admin";
import { dateLabel, money } from "./billing";
import { originFrom } from "./invite";
import { notifyBilling, renderEmail, sendEmail, type Recipient } from "./notify";
import { savingsLine, type PackageLevel, type PackageOffer } from "./package-builder";

/**
 * Admin → Money → Package requests (owner, 28 Oct 2026): work an offer out, publish it to the client,
 * confirm a 6-month plan, close a request, edit the discount levels. Every number comes from
 * private.build_offer, the same function the saved offer uses.
 */
export type OfferInput = {
  name: string;
  full_days: number;
  half_days: number;
  short_edits: number;
  long_edits: number;
  long_minutes: number;
  property_value: number;
  discount_pct: number | null;
  price: number | null;
  start: string;
  usage_enabled: boolean;
  minimum: number | null;
  six_enabled: boolean;
  note: string;
};

type Result<T = undefined> = { ok: boolean; error?: string; notice?: string; data?: T };

const fail = (e: unknown): Result<never> => {
  const m = e instanceof Error ? e.message : String(e);
  console.error("[admin/packages]", m);
  if (/not allowed/.test(m)) return { ok: false, error: "The portal admin key isn’t set up." };
  const known = [
    "days and edits are whole numbers from 0",
    "add hours or edits",
    "long-form length is 5 to 30 minutes",
    "property value is 0 or more",
    "set the content prices first",
    "set the long-form edit price first",
    "discount is 0 to 60%",
    "enter the monthly price",
    "the package starts on the 1st of this month or later",
    "the minimum is 0 or more",
    "this request is already decided",
    "no 6-month request to confirm",
    "this account already has a monthly plan",
    "start next month: there are bookings this month",
    "this offer has expired",
    "one to eight levels",
    "each level starts above the one before",
    "discounts are 0 to 60%",
    "the first level starts at 0",
    "the 6-month discount is 0 to 50%",
  ].find((k) => m.includes(k));
  if (known) return { ok: false, error: known.charAt(0).toUpperCase() + known.slice(1) + "." };
  return { ok: false, error: "Couldn’t save. Try again." };
};

const refresh = (id?: string) => {
  revalidatePath("/admin/billing/package-requests");
  if (id) revalidatePath(`/admin/billing/package-requests/${id}`);
  revalidatePath("/admin");
};

export async function previewOffer(id: string, o: OfferInput): Promise<Result<PackageOffer>> {
  try {
    const rpc = await portalAdminAction();
    const data = await rpc<PackageOffer>("portal_admin_preview_package_offer", {
      p_id: id,
      p_offer: o,
    });
    return { ok: true, data };
  } catch (e) {
    return fail(e);
  }
}

export async function publishOffer(id: string, o: OfferInput): Promise<Result> {
  try {
    const rpc = await portalAdminAction();
    const out = await rpc<PackageOffer & { recipients: Recipient[] }>(
      "portal_admin_publish_package_offer",
      { p_id: id, p_offer: o },
    );
    // "Your package is ready": a short email to the billing contacts; the offer itself is on Billing.
    const link = `${originFrom(await headers())}/portal/billing`;
    const save = savingsLine(out);
    for (const r of out.recipients ?? []) {
      const { text, html } = renderEmail(
        [
          `Hi${r.name ? ` ${r.name}` : ""},`,
          `Your monthly package is ready: ${out.hours} hours of shooting and ${out.edits} edits for ${money(
            out.currency,
            out.price,
          )} a month, from ${dateLabel(out.start)}.`,
          ...(save ? [`${save}.`] : []),
          "See it and choose how to pay on Billing.",
        ],
        "See your package",
        link,
      );
      await sendEmail(r.email, "Your monthly package is ready", text, html);
    }
    refresh(id);
    return { ok: true, notice: "Published. The client sees it on Billing." };
  } catch (e) {
    return fail(e);
  }
}

export async function confirmSixMonths(id: string): Promise<Result> {
  try {
    const rpc = await portalAdminAction();
    const out = await rpc<{
      account: string;
      invoice_id: string;
      number: string | null;
      recipients: Recipient[];
    }>("portal_admin_confirm_six_months", { p_id: id });
    const inv = await invoiceOf(out.account, out.invoice_id);
    if (inv && out.recipients?.length)
      await notifyBilling(
        out.account,
        "invoice_issued",
        {
          number: inv.number ?? "",
          amount: money(inv.currency, inv.amount),
          due: dateLabel(inv.due_on),
        },
        out.recipients,
        `${originFrom(await headers())}/portal/billing`,
      );
    refresh(id);
    revalidatePath(`/admin/accounts/${out.account}`);
    return {
      ok: true,
      notice: `6-month plan set. First instalment ${out.number ?? ""} published.`,
    };
  } catch (e) {
    return fail(e);
  }
}

async function invoiceOf(account: string, id: string) {
  const rpc = await portalAdminAction();
  const rows = await rpc<
    { id: string; number: string | null; amount: number; currency: string; due_on: string }[]
  >("portal_admin_invoices", { p_account: account, p_status: null });
  return rows.find((r) => r.id === id) ?? null;
}

export async function closeRequest(id: string, backToOffer = false): Promise<Result> {
  try {
    const rpc = await portalAdminAction();
    await rpc("portal_admin_close_package_request", { p_id: id, p_back_to_offer: backToOffer });
    refresh(id);
    return {
      ok: true,
      notice: backToOffer ? "6-month plan declined; the offer stays open." : "Closed.",
    };
  } catch (e) {
    return fail(e);
  }
}

export async function saveLevels(levels: PackageLevel[], sixMonthPct: number): Promise<Result> {
  try {
    const rpc = await portalAdminAction();
    await rpc("portal_admin_save_package_levels", {
      p_levels: levels,
      p_six_month_pct: sixMonthPct,
    });
    refresh();
    return { ok: true, notice: "Saved." };
  } catch (e) {
    return fail(e);
  }
}
