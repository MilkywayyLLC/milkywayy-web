import { dateLabel, money } from "./billing";
import { creditLabel } from "./rollover";

/**
 * A package month's words (owner, 28 Oct 2026). Every number comes from the database's one summary
 * (private.plan_summary: the portal's my_billing_payments.value, the admin's portal_admin_value_month and
 * portal_admin_plan_summaries); these only phrase it, so the client and every admin page say the same.
 */
export type PlanBilling = "usage" | "upfront";

export type PlanCredit = {
  description: string;
  amount: number;
  number: string | null;
  ref: string | null;
  paid: boolean;
};

export type CarryNotice = { allowance: number; half_days: number; month: string; until: string };

/** The summary fields beyond the meters (ValueMonth carries both). */
export type PlanMoney = {
  name: string;
  currency: string;
  price: number;
  month: string;
  month_end?: string;
  billing?: PlanBilling;
  month_mode?: PlanBilling;
  upfront_from?: string | null;
  minimum?: number | null;
  base_allowance?: number;
  allowance: number;
  usage_total?: number;
  extras_total: number;
  credits?: PlanCredit[] | null;
  credits_total?: number;
  amount?: number;
  next_invoice_on?: string;
  next_invoice_amount?: number;
  carry_notice?: CarryNotice | null;
};

const monthName = (d: string) =>
  new Date(`${d.slice(0, 10)}T12:00:00`).toLocaleDateString("en-GB", { month: "long" });
const short = (d: string) => dateLabel(d, { year: undefined });

/** This month is billed on usage (month end) or was paid upfront. */
export const monthMode = (v: PlanMoney): PlanBilling => v.month_mode ?? v.billing ?? "usage";

/** "Month end · pay for what you use" / "Start of month · pay upfront". */
export const BILLING_LABEL: Record<PlanBilling, string> = {
  usage: "Month end · pay for what you use",
  upfront: "Start of month · pay upfront",
};

/** "up to AED 10,000 / month" (usage) or "AED 10,000 paid for October" (upfront). */
export function planAmount(v: PlanMoney) {
  const m = (n: number) => money(v.currency, Number(n));
  return monthMode(v) === "upfront"
    ? `${m(v.price)} paid for ${monthName(v.month)}`
    : `up to ${m(v.base_allowance ?? v.allowance)} / month`;
}

/** "Growth · up to AED 10,000 / month" or "Growth · AED 10,000 paid for October". */
export const planTitle = (v: PlanMoney) => `${v.name} · ${planAmount(v)}`;

/** The next invoice: date and amount so far. */
export function nextInvoice(v: PlanMoney) {
  return {
    on: v.next_invoice_on ?? v.month_end ?? v.month,
    amount: Number(v.next_invoice_amount ?? v.amount ?? 0),
  };
}

/**
 * The money line under the meters. Usage: "You'll be billed AED 2,700 on 31 Oct (so far)". Upfront:
 * "Next invoice 1 Nov: AED 10,000 (November's package + AED 500 extras so far)".
 */
export function billLine(v: PlanMoney) {
  const m = (n: number) => money(v.currency, Number(n));
  const n = nextInvoice(v);
  if (monthMode(v) === "usage") return `You’ll be billed ${m(n.amount)} on ${short(n.on)} (so far)`;
  const extras = Number(v.extras_total);
  return `Next invoice ${short(n.on)}: ${m(n.amount)} (${monthName(n.on)}’s package${
    extras > 0 ? ` + ${m(extras)} extras so far` : ""
  })`;
}

/** Upfront billing starting later: "Upfront billing starts 1 Nov". */
export const upfrontLater = (v: PlanMoney) =>
  v.billing === "upfront" && monthMode(v) === "usage" && v.upfront_from
    ? `Upfront billing starts ${short(v.upfront_from)}`
    : null;

/** The last 7 days of an upfront month: "AED 1,200 and 1 day unused — carries over to November (expires 30 Nov)". */
export function carryNoticeLine(v: PlanMoney) {
  const c = v.carry_notice;
  if (!c) return null;
  return `${creditLabel(v.currency, c.allowance, c.half_days)} unused — carries over to ${monthName(c.month)} (expires ${short(c.until)})`;
}
