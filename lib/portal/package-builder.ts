import { money } from "./billing";

/**
 * Monthly package builder (owner, 28 Oct 2026). A package is shoot hours (half and full days only) plus
 * edits at pay-as-you-go prices, less a volume discount by the month's value. The numbers an offer
 * carries are worked out once in the database (private.build_offer); these only shape and phrase them.
 */
export type PackageNeed = "content" | "property" | "editing";
export type PackageOption = "upfront" | "usage" | "six";

export const NEED_LABEL: Record<PackageNeed, string> = {
  content: "Content",
  property: "Property",
  editing: "Editing only",
};

export const LONG_MINUTES = [5, 10, 15, 20, 25, 30] as const;

export type PackageVolume = {
  short: number;
  long: number;
  long_minutes: number | null;
  property: number;
};

export type PackageOffer = {
  name: string;
  currency: string;
  full_days: number;
  half_days: number;
  hours: number;
  short_edits: number;
  long_edits: number;
  edits: number;
  long_minutes: number;
  property_value: number;
  rates: {
    full_day: number | null;
    half_day: number | null;
    short_edit: number | null;
    long_edit: number | null;
  };
  payg_total: number;
  level: { from: number; pct: number | null };
  discount_pct: number;
  price: number;
  savings: number;
  half_day_package_rate: number;
  extra_half_days: number;
  start: string;
  usage_enabled: boolean;
  minimum: number | null;
  six_enabled: boolean;
  six_month_pct: number;
  six_month_price: number;
  six_total: number;
  six_instalment: number;
  note: string | null;
};

export type PackageRequest = {
  id: string;
  status: "new" | "offered" | "six_requested" | "accepted" | "closed";
  needs: PackageNeed[];
  volume: PackageVolume;
  payment_pref: "upfront" | "usage";
  six_months: boolean;
  scripting: boolean;
  created_at: string;
  offered_at: string | null;
  accepted_option: PackageOption | null;
  offer: PackageOffer | null;
};

export type PackageHint = { value: number; pct: number; package: number; currency: string };

export type MyPackageOffer = {
  mode: "payg" | "package" | "budget";
  hint: PackageHint | null;
  request: PackageRequest | null;
};

export type PackageLevel = { from: number; pct: number | null };

/** Hours from volume: a short-form is 1 h, a long-form 2 h, rounded up to the next 4 h (a half day). */
export function hoursFromVolume(short: number, long: number) {
  const raw = Math.max(0, short) + Math.max(0, long) * 2;
  return Math.ceil(raw / 4) * 4;
}

/** Full days first, then half days: 20 h → 2 full + 1 half. */
export function splitHours(hours: number) {
  const full = Math.floor(hours / 8);
  return { full, half: Math.round((hours - full * 8) / 4) };
}

/** "2 full days + 1 half day" / "5 half days". */
export function splitLabel(full: number, half: number) {
  const parts = [
    full > 0 ? `${full} full day${full === 1 ? "" : "s"}` : "",
    half > 0 ? `${half} half day${half === 1 ? "" : "s"}` : "",
  ].filter(Boolean);
  return parts.join(" + ") || "No shoot days";
}

/** "12 edits (10 short-form, 2 long-form · 10 min)". */
export function editsLabel(o: Pick<PackageOffer, "short_edits" | "long_edits" | "long_minutes">) {
  const n = o.short_edits + o.long_edits;
  if (!n) return "No edits";
  const parts = [
    o.short_edits ? `${o.short_edits} short-form` : "",
    o.long_edits ? `${o.long_edits} long-form · ${o.long_minutes} min` : "",
  ].filter(Boolean);
  return `${n} edit${n === 1 ? "" : "s"} (${parts.join(", ")})`;
}

/** "10K" / "27.5K" / "950". */
export const k = (n: number) =>
  n >= 1000 ? `${Number((n / 1000).toFixed(n % 1000 === 0 ? 0 : 1))}K` : String(Math.round(n));

/** "10K × 6 = 60K − 10% = 54K · 27K now + 27K at start of month 4". */
export const sixMonthLine = (o: PackageOffer) =>
  `${k(o.price)} × 6 = ${k(o.price * 6)} − ${o.six_month_pct}% = ${k(o.six_total)} · ${k(
    o.six_instalment,
  )} now + ${k(o.six_instalment)} at start of month 4`;

/** "Save AED 1,500 a month vs pay as you go"; null when the price isn't lower. */
export function savingsLine(o: PackageOffer) {
  if (o.savings <= 0) return null;
  return `Save ${money(o.currency, o.savings)} a month vs pay as you go`;
}

/** "32.4K now + 32.4K at month 4". */
export const sixSplit = (o: Pick<PackageOffer, "six_instalment">) =>
  `${k(o.six_instalment)} now + ${k(o.six_instalment)} at month 4`;

/** The three ways to pay, worded the same for the client and the admin. */
export const PAY_WORDS = {
  upfront: {
    title: "Upfront each month",
    detail: "unused shoot hours and edits roll over to next month",
  },
  usage: {
    title: "Pay at the end of the month",
    detail: "you only pay for what you used",
  },
  six: {
    title: (pct?: number) => (pct ? `6 months · ${pct}% off` : "6 months · extra discount"),
    detail: (o?: Pick<PackageOffer, "six_instalment">) =>
      `${o ? sixSplit(o) : "half now, half at month 4"} · bank transfer`,
  },
} as const;

/** The discount level as a label: "8% off", "No discount", "Custom". */
export const levelLabel = (pct: number | null | undefined) =>
  pct == null ? "Custom" : pct > 0 ? `${pct}% off` : "No discount";
