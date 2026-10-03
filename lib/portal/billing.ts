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
};

export type Usage = { key: string; label: string; qty: number; used: number };
export type MyBilling = {
  currency: "AED" | "USD";
  mode: "payg" | "package";
  plan: {
    name: string;
    price: number;
    currency: string;
    renews_on: string;
    period_start: string;
    overage: { key: string; label: string; amount: number }[];
    usage: Usage[];
  } | null;
  payg: {
    month: string;
    total: number;
    items: {
      description: string;
      qty: number;
      unit_price: number;
      kind: string | null;
      ref: string;
      title: string;
    }[];
  };
  suggestion: {
    package: string;
    price: number;
    currency: string;
    average: number;
    saving: number;
  } | null;
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

/** The WhatsApp chat (business number) for "talk to us" buttons. */
export const CHAT_NUMBER = "971507263306";
export const chatLink = (text: string) =>
  `https://wa.me/${CHAT_NUMBER}?text=${encodeURIComponent(text)}`;
