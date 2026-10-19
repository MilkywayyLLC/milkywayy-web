"use server";

import { revalidatePath } from "next/cache";
import { portalAdminAction } from "./admin";

/**
 * Budget packages and the client's own rates (owner, 10 Oct 2026). Changes apply from a chosen
 * date (default: next month) and keep their history; logged items keep the price they were
 * logged at, so nothing already logged is repriced.
 */
export type BudgetResult = { ok: boolean; error?: string; notice?: string };

const fail = (e: unknown): BudgetResult => {
  const err = e as { message?: string; code?: string };
  console.error("[admin/budget]", err?.message);
  if (err?.code === "22023" && err.message)
    return { ok: false, error: err.message.charAt(0).toUpperCase() + err.message.slice(1) + "." };
  return { ok: false, error: "Couldn’t save. Try again." };
};
const done = (account: string, notice: string): BudgetResult => {
  revalidatePath(`/admin/accounts/${account}`);
  return { ok: true, notice };
};
const isDate = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d);

export async function setBudget(
  account: string,
  amount: number,
  from: string,
  advance: boolean,
): Promise<BudgetResult> {
  if (!(amount > 0)) return { ok: false, error: "Enter the monthly amount." };
  if (!isDate(from)) return { ok: false, error: "Choose the month it starts." };
  try {
    const rpc = await portalAdminAction();
    await rpc("portal_admin_set_budget", {
      p_account: account,
      p_amount: amount,
      p_from: from,
      p_advance: advance,
    });
    return done(account, "Monthly package saved.");
  } catch (e) {
    return fail(e);
  }
}

export async function setClientRate(
  account: string,
  key: string,
  amount: number,
  from: string,
): Promise<BudgetResult> {
  if (!(amount >= 0)) return { ok: false, error: "Enter the rate." };
  if (!isDate(from)) return { ok: false, error: "Choose the date it applies from." };
  try {
    const rpc = await portalAdminAction();
    await rpc("portal_admin_set_client_rate", {
      p_account: account,
      p_key: key,
      p_amount: amount,
      p_from: from,
    });
    return done(account, "Rate saved. Items already logged keep their price.");
  } catch (e) {
    return fail(e);
  }
}

export async function setBillingSwitches(
  account: string,
  showBudget: boolean | null,
  paygInvoicing: "per_project" | "month_end",
  advance: boolean | null,
): Promise<BudgetResult> {
  try {
    const rpc = await portalAdminAction();
    await rpc("portal_admin_set_billing_switches", {
      p_account: account,
      p_show_budget: showBudget,
      p_payg_invoicing: paygInvoicing,
      p_advance: advance,
    });
    return done(account, "Saved.");
  } catch (e) {
    return fail(e);
  }
}
