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
  /** Package invoice: month end on usage, or upfront on the 1st (28 Oct 2026). */
  billing: "usage" | "upfront";
  /** Usage mode: the minimum monthly amount (null: usage only). */
  minimum: number | null;
  inclusions: { key: string; label: string; qty: number }[];
  /** Value packages: the monthly allowance and the half-day cap (both, or neither). */
  allowance?: number | null;
  half_day_cap?: number | null;
};

export async function saveClientPackage(account: string, p: PackageInput): Promise<SetupResult> {
  if (!(p.amount >= 0)) return { ok: false, error: "Enter the monthly amount." };
  if (p.minimum != null && !(p.minimum >= 0))
    return { ok: false, error: "The minimum is 0 or more (blank: usage only)." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(p.started)) return { ok: false, error: "Choose the start date." };
  try {
    const rpc = await portalAdminAction();
    const id = await rpc<string>("portal_admin_save_client_package", { p_account: account, p });
    // The value model (owner, 24 Oct 2026): a monthly allowance and a half-day cap.
    if (p.allowance !== undefined)
      await rpc("portal_admin_set_package_value", {
        p_package: id,
        p_allowance: p.allowance,
        p_cap: p.half_day_cap ?? null,
      });
    return done(account, "Saved.");
  } catch (e) {
    return fail(e);
  }
}

/** What a switch from pay as you go moves onto the package (shown before saving). */
export type SwitchPreview = {
  month: string;
  projects: { ref: string; title: string | null; value: number }[];
  usage_total: number;
  credits: {
    description: string;
    amount: number;
    number: string | null;
    ref: string | null;
    paid: boolean;
  }[];
  voids: { id: string; number: string | null; amount: number; stage: string | null; ref: string }[];
  payg_drafts: { id: string; amount: number }[];
};

export async function switchPreview(account: string, start: string): Promise<SwitchPreview | null> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) return null;
  try {
    const rpc = await portalAdminAction();
    return await rpc<SwitchPreview | null>("portal_admin_switch_preview", {
      p_account: account,
      p_start: start,
    });
  } catch (e) {
    console.error("[admin/client-setup] switch preview:", e instanceof Error ? e.message : e);
    return null;
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
