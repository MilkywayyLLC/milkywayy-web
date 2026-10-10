import type { SupabaseClient } from "@supabase/supabase-js";
import type { PropertyPricing } from "@/content/types";
import { getPropertyPricing } from "@/lib/data";
import { maxUploadGb } from "@/lib/r2";
import { can } from "./access";
import type { Membership } from "./auth";
import { dubaiToday } from "./billing";
import type { Rates } from "./booking";

/**
 * What the "Start something" modals need (owner, 10 Oct 2026): which ones this person may open,
 * the client's own rates (only for those who see prices), whether to show amounts (pay as you go:
 * yes; packages: only with "Show budget and activity" on), and the turnaround texts.
 */
export type PriceView = {
  mode: "payg" | "package" | "budget";
  currency: string;
  /** null: no prices at all (no billing access). */
  rates: Rates | null;
  /** Show the amount (pay as you go, or a package with the budget switch on). */
  showAmount: boolean;
};
export type RequestConfig = {
  shoots: boolean;
  editing: boolean;
  avatars: boolean;
  pricing: PropertyPricing;
  price: PriceView;
  today: string;
  maxGb: number;
  turnaround: Record<string, string>;
};

export async function requestConfig(db: SupabaseClient, m: Membership): Promise<RequestConfig> {
  const [{ data: opts }, { data: ta }, pricing] = await Promise.all([
    db.rpc("my_booking_options", { p_account: m.account.id }),
    db.from("service_turnaround").select("key, text"),
    getPropertyPricing(),
  ]);
  const o = (opts ?? {}) as {
    mode?: PriceView["mode"];
    currency?: string;
    rates?: Rates | null;
    show_amount?: boolean;
  };
  return {
    shoots: can(m, "shoots"),
    editing: can(m, "editing"),
    avatars: can(m, "avatars"),
    pricing,
    price: {
      mode: o.mode ?? "payg",
      currency: o.currency ?? m.account.currency,
      rates: o.rates ?? null,
      showAmount: !!o.show_amount,
    },
    today: dubaiToday(),
    maxGb: maxUploadGb(),
    turnaround: Object.fromEntries(
      ((ta ?? []) as { key: string; text: string }[]).map((t) => [t.key, t.text]),
    ),
  };
}
