import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { PropertyPricing } from "@/content/types";
import { getPropertyPricing } from "@/lib/data";
import { maxUploadGb } from "@/lib/r2";
import { can } from "./access";
import { getPortal, type Membership } from "./auth";
import { dubaiToday } from "./billing";
import { stripeReady } from "@/lib/stripe";
import { clientPricing, type Left, type Rates } from "./booking";
import { DEFAULT_TERMS, type TermsView } from "./payments";

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
  /** Package clients with price access: what's left of each inclusion this month. */
  left: Left | null;
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
  /** The Agent picker: the account's contacts, and this person's own linked card (the default). */
  agents: { id: string; name: string }[];
  myContactId: string | null;
  /** Payment terms for the summary (owner, 24 Oct 2026), and whether card payment is on. */
  terms: TermsView;
  card: boolean;
};

/**
 * Once per request: the portal layout (Book media) and most tab pages both need it. React's
 * cache matches the same db client and membership objects (both come from the cached getPortal).
 */
export const requestConfig = cache(loadRequestConfig);

async function loadRequestConfig(db: SupabaseClient, m: Membership): Promise<RequestConfig> {
  // Fail safe: an error here means no prices and no turnaround, never a broken page.
  const [
    { data: opts, error: e1 },
    { data: ta, error: e2 },
    pricing,
    { data: people },
    portal,
    { data: terms, error: e3 },
  ] = await Promise.all([
    db.rpc("my_booking_options", { p_account: m.account.id }),
    db.from("service_turnaround").select("key, text"),
    getPropertyPricing(),
    db.from("contacts").select("id, name, member_id").eq("account_id", m.account.id).order("name"),
    getPortal(),
    db.rpc("my_payment_terms", { p_account: m.account.id }),
  ]);
  const uid = portal.state === "signed-in" ? portal.user.id : null;
  if (e1 || e2 || e3)
    console.error("[portal] request config:", e1?.message ?? e2?.message ?? e3?.message);
  const o = (opts ?? {}) as {
    mode?: PriceView["mode"];
    currency?: string;
    rates?: Rates | null;
    show_amount?: boolean;
    left?: Left | null;
  };
  return {
    shoots: can(m, "shoots"),
    editing: can(m, "editing"),
    avatars: can(m, "avatars"),
    // The property builder and estimates use this client's own prices (owner, 17 Oct 2026).
    pricing: clientPricing(pricing, o.rates ?? null),
    price: {
      mode: o.mode ?? "payg",
      currency: o.currency ?? m.account.currency,
      rates: o.rates ?? null,
      showAmount: !!o.show_amount,
      left: o.left ?? null,
    },
    today: dubaiToday(),
    maxGb: maxUploadGb(),
    agents: (people ?? []).map((c) => ({ id: c.id, name: c.name })),
    myContactId: (uid && people?.find((c) => c.member_id === uid)?.id) || null,
    terms: { ...DEFAULT_TERMS, ...((terms as TermsView | null) ?? {}) },
    card: stripeReady(),
    turnaround: Object.fromEntries(
      ((ta ?? []) as { key: string; text: string }[]).map((t) => [t.key, t.text]),
    ),
  };
}
