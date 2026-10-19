"use server";

import { revalidatePath } from "next/cache";
import { portalAdminAction } from "./admin";

/**
 * Admin → Client accounts → client (owner, 17 Oct 2026): enabled services, the client's price
 * list and their monthly package. The database checks everything; these only shape the call.
 */
export type SetupResult = { ok: boolean; error?: string; notice?: string };

const fail = (e: unknown): SetupResult => {
  const err = e as { message?: string; code?: string };
  console.error("[admin/client-setup]", err?.message);
  if (err?.code === "22023" && err.message)
    return { ok: false, error: err.message.charAt(0).toUpperCase() + err.message.slice(1) + "." };
  return { ok: false, error: "Couldn’t save. Try again." };
};
const done = (account: string, notice: string): SetupResult => {
  revalidatePath(`/admin/accounts/${account}`);
  return { ok: true, notice };
};

export async function setServices(
  account: string,
  s: { production: boolean; post: boolean; avatars: boolean },
): Promise<SetupResult> {
  try {
    const rpc = await portalAdminAction();
    await rpc("portal_admin_set_services", {
      p_account: account,
      p_production: s.production,
      p_post: s.post,
      p_avatars: s.avatars,
    });
    return done(account, "Saved.");
  } catch (e) {
    return fail(e);
  }
}

/** The whole price list; null = the default price. */
export async function saveClientPrices(
  account: string,
  prices: { key: string; amount: number | null }[],
): Promise<SetupResult> {
  if (prices.some((p) => p.amount != null && !(p.amount >= 0)))
    return { ok: false, error: "Prices of 0 or more (blank for the default)." };
  try {
    const rpc = await portalAdminAction();
    const n = await rpc<number>("portal_admin_save_client_prices", {
      p_account: account,
      p_prices: prices,
    });
    return done(
      account,
      n ? `Saved. ${n} price${n === 1 ? "" : "s"} changed from today.` : "Saved.",
    );
  } catch (e) {
    return fail(e);
  }
}

export type PackageInput = {
  template_id: string | null;
  name: string;
  amount: number;
  term: 1 | 6;
  started: string;
  ends: string | null;
  advance: boolean;
  inclusions: { key: string; label: string; qty: number }[];
};

export async function saveClientPackage(account: string, p: PackageInput): Promise<SetupResult> {
  if (!(p.amount >= 0)) return { ok: false, error: "Enter the monthly amount." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(p.started)) return { ok: false, error: "Choose the start date." };
  try {
    const rpc = await portalAdminAction();
    await rpc("portal_admin_save_client_package", { p_account: account, p });
    return done(account, "Saved.");
  } catch (e) {
    return fail(e);
  }
}

/** Back to pay as you go, with how its invoices go out. */
export async function setPayg(
  account: string,
  invoicing: "per_project" | "month_end",
  showBudget: boolean | null,
): Promise<SetupResult> {
  try {
    const rpc = await portalAdminAction();
    await rpc("portal_admin_set_plan", {
      p_account: account,
      p_mode: "payg",
      p_package: null,
      p_started: null,
      p_renews: null,
      p_term: 1,
      p_ends: null,
    });
    await rpc("portal_admin_set_billing_switches", {
      p_account: account,
      p_show_budget: showBudget,
      p_payg_invoicing: invoicing,
      p_advance: null,
    });
    return done(account, "Saved. Now pay as you go.");
  } catch (e) {
    return fail(e);
  }
}
