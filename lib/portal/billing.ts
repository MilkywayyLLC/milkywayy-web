/**
 * Billing (CLIENT_PORTAL_GUIDE §5.5, §7.3; owner decisions 3 Oct 2026): shared types and helpers.
 * Prices only ever reach an account's Owner and Admins (the database enforces it).
 */
export type InvoiceStatus = "due" | "paid" | "overdue";
/** Drafts and approved invoices are Milkywayy's only; clients see published ones (owner, 10 Oct 2026). */
export type QueueStatus = "draft" | "approved" | InvoiceStatus;
export type InvoiceCategory = "budget" | "fixed" | "payg" | "property" | "one_off" | "manual";
export type InvoiceLine = {
  description: string;
  qty: number;
  unit_price: number;
  amount: number;
  line_item_id?: string;
  kind?: string;
};

export type Invoice = {
  id: string;
  account_id: string;
  number: string | null;
  issued_on: string;
  due_on: string;
  amount: number;
  currency: "AED" | "USD";
  status: InvoiceStatus;
  paid_at: string | null;
  pdf_key: string | null;
  note: string | null;
  statement_month?: string | null;
  /** Bank transfer: the client sent a proof ("submitted") or it was turned down ("rejected"). */
  payment_state?: "submitted" | "rejected" | null;
  reject_reason?: string | null;
  paid_via?: "stripe" | "bank" | "manual" | null;
  /** Invoices made from drafts carry their lines (the breakdown) and totals. */
  lines?: InvoiceLine[];
  subtotal?: number | null;
  vat_rate?: number;
  vat?: number;
  category?: InvoiceCategory | null;
  period_start?: string | null;
  pdf_source?: "generated" | "ledger";
};

export type Inclusion = { key: string; label: string; qty: number };
export type Usage = {
  key: string;
  label: string;
  qty: number;
  used: number;
  remaining: number;
  over: number;
  rate: number | null;
  overage: number;
};
export type LineItem = {
  description: string;
  qty: number;
  unit_price: number;
  kind: string | null;
  ref: string;
  title?: string;
};
/**
 * A package client's calendar month (owner, 4 Oct 2026): the first month is pro-rated when the
 * package starts mid-month (price and inclusions by days), and work delivered before the start
 * that month is pay as you go. The live view, statements and invoices share this.
 */
export type PlanView = {
  name: string;
  price: number;
  full_price: number;
  prorated: boolean;
  days: number;
  month_days: number;
  currency: string;
  inclusions: Inclusion[];
  term_months: 1 | 6;
  discount_pct: number | null;
  /** Month n of the contract; null in a pro-rated first month. */
  month_no: number | null;
  started_on: string | null;
  ends_on: string | null;
  month: string;
  renews_on: string;
  period_start: string;
  usage: Usage[];
  overage_total: number;
  extras: LineItem[];
  extras_total: number;
  before: LineItem[];
  before_total: number;
  estimate: number;
};
/**
 * An offer for a client. `saving` is null without enough history (or on a package); a pinned
 * offer that doesn't save money shows as "Your offer" without a saving (show_saving false).
 */
export type Offer = {
  package_id: string;
  package: string;
  inclusions: Inclusion[];
  currency: string;
  price: number;
  discount_pct: number;
  price_6: number;
  pinned: boolean;
  show_saving: boolean;
  saving: number | null;
  saving_6: number | null;
  average?: number;
  overage?: number;
  uncovered?: number;
  cost?: number;
  active_months?: number;
};
/**
 * What the client's Billing page gets (owner, 4 Oct 2026): money only on invoices. A package is
 * usage as counts; a suggestion is the package, its prices and the saving, never their spend.
 */
export type ClientPlan = {
  name: string;
  prorated: boolean;
  term_months: 1 | 6;
  month_no: number | null;
  started_on: string | null;
  ends_on: string | null;
  renews_on: string;
  usage: Pick<Usage, "key" | "label" | "qty" | "used" | "remaining" | "over">[];
};
export type ClientOffer = Pick<
  Offer,
  | "package_id"
  | "package"
  | "inclusions"
  | "currency"
  | "price"
  | "price_6"
  | "discount_pct"
  | "pinned"
  | "show_saving"
  | "saving"
  | "saving_6"
>;
/** One shoot (or other piece of work) in a month's activity, with its line items. */
export type ActivityRow = {
  project_id: string | null;
  ref: string | null;
  title: string | null;
  date: string | null;
  location: string | null;
  total: number;
  items: {
    description: string;
    qty: number;
    unit_price: number;
    amount: number;
    kind: string | null;
  }[];
};
/** A budget package's month (owner, 10 Oct 2026): AED/USD, never credits. */
export type BudgetMonth = {
  month: string;
  budget: number | null;
  total: number;
  activity: ActivityRow[];
};
export type MyBilling = {
  currency: "AED" | "USD";
  mode: "payg" | "package" | "budget";
  /** "Show budget and activity" (per client; on for budget packages unless switched off). */
  show_budget?: boolean;
  budget?: BudgetMonth | null;
  activity?: ActivityRow[] | null;
  plan: ClientPlan | null;
  suggestion: ClientOffer | null;
  pay_online: boolean;
  bank: {
    account_name: string | null;
    bank: string | null;
    iban: string;
    swift: string | null;
  } | null;
};

/** A frozen month-end statement: the breakdown behind a monthly invoice. */
export type StatementRow = {
  month: string;
  currency: "AED" | "USD";
  mode: "payg" | "package";
  package: {
    name: string;
    price: number;
    full_price: number;
    prorated: boolean;
    term_months: number;
    overage_total: number;
    extras_total: number;
    before_total: number;
  } | null;
  lines: (LineItem & { amount: number })[];
  overage: Usage[];
  subtotal: number;
  vat_rate: number;
  vat: number;
  total: number;
};

/** "2 extra reels", "1 extra shoot day". */
export const extraCount = (n: number, label: string) => {
  const l = label.toLowerCase();
  return `${n} extra ${n === 1 ? l.replace(/s$/, "") : l}`;
};

/** Today in Dubai, as YYYY-MM-DD. */
export const dubaiToday = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dubai" }).format(new Date());

/** Due becomes Overdue the day after the due date (the cron also records it). */
export const shownStatus = (i: Pick<Invoice, "status" | "due_on">): InvoiceStatus =>
  i.status === "due" && i.due_on < dubaiToday() ? "overdue" : i.status;

export const STATUS_LABEL: Record<InvoiceStatus, string> = {
  due: "Due",
  paid: "Paid",
  overdue: "Overdue",
};
export const QUEUE_STATUS_LABEL: Record<QueueStatus, string> = {
  draft: "Draft",
  approved: "Approved",
  due: "Published",
  paid: "Paid",
  overdue: "Overdue",
};
export const CATEGORY_LABEL: Record<InvoiceCategory, string> = {
  budget: "Budget package",
  fixed: "Fixed package",
  payg: "Pay as you go",
  property: "Property shoot",
  one_off: "One-off",
  manual: "Manual",
};

/**
 * The budget bar (owner, 10 Oct 2026): how full, capped at 100%. Past the package amount the bar
 * stays full and the card simply shows the higher total; no "over" wording, no warning colour.
 */
export const budgetPct = (total: number, budget: number | null | undefined) =>
  budget && budget > 0 ? Math.min(100, Math.round((total / budget) * 100)) : 0;

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** "4 reels, 1 long-form, property photos 2BR": what a shoot produced, from its line items. */
export function producedSummary(
  items: { description: string; qty: number; kind: string | null }[],
) {
  const by = new Map<string, number>();
  const other: string[] = [];
  for (const i of items) {
    const q = Number(i.qty);
    if (i.kind === "reel") by.set("reel", (by.get("reel") ?? 0) + q);
    else if (i.kind === "long_form") by.set("long_form", (by.get("long_form") ?? 0) + q);
    else
      other.push(q > 1 && !/^\d/.test(i.description) ? `${q} × ${i.description}` : i.description);
  }
  const out: string[] = [];
  if (by.get("reel")) out.push(plural(by.get("reel")!, "reel"));
  if (by.get("long_form")) out.push(`${by.get("long_form")} long-form`);
  return [...out, ...other.map((o) => o.charAt(0).toLowerCase() + o.slice(1))].join(", ");
}

export const money = (currency: string, n: number) =>
  `${currency} ${Number(n).toLocaleString("en-US", { minimumFractionDigits: Number(n) % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;

export const dateLabel = (d: string | null | undefined, opts: Intl.DateTimeFormatOptions = {}) =>
  d
    ? new Date(`${d.slice(0, 10)}T12:00:00`).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
        ...opts,
      })
    : "";

/** What a line item is: also the keys of package inclusions and rates (rate_card.key). */
export const KINDS = [
  ["shoot", "Property shoot"],
  ["shoot_day", "Shoot day"],
  ["photo", "Photo edit"],
  ["reel", "Short-form reel"],
  ["long_form", "Long-form video"],
  ["avatar_video", "AI avatar video"],
  ["avatar_setup", "AI avatar setup"],
] as const;
export const kindLabel = (k: string | null | undefined) =>
  KINDS.find((x) => x[0] === k)?.[1] ?? k ?? "Other";

/** "October 2026" from a month's first day. */
export const monthLabel = (m: string | null | undefined) =>
  m
    ? new Date(`${m.slice(0, 10)}T12:00:00`).toLocaleDateString("en-GB", {
        month: "long",
        year: "numeric",
      })
    : "";

/** "10 reels, 2 shoot days" from a package's inclusions. */
export const inclusionsText = (inc: Inclusion[]) =>
  inc.map((i) => `${Number(i.qty)} ${i.label.toLowerCase()}`).join(", ");

/** The WhatsApp chat (business number) for "talk to us" buttons. */
export const CHAT_NUMBER = "971507263306";
export const chatLink = (text: string) =>
  `https://wa.me/${CHAT_NUMBER}?text=${encodeURIComponent(text)}`;
