/**
 * Billing (CLIENT_PORTAL_GUIDE §5.5, §7.3; owner decisions 3 Oct 2026): shared types and helpers.
 * Prices only ever reach an account's Owner and Admins (the database enforces it).
 */
export type InvoiceStatus = "due" | "paid" | "overdue";

export type Invoice = {
  id: string;
  account_id: string;
  number: string;
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
export type MyBilling = {
  currency: "AED" | "USD";
  mode: "payg" | "package";
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
