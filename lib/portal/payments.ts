/**
 * Payment terms, cancellations and booking terms (owner, 24 Oct 2026; docs/PAYMENT_TERMS_PLAN.md).
 * Pure functions: the booking summary, the cancel dialog and the server use the same numbers, and the
 * server applies what it worked out here (portal_admin_apply_change), never what a browser sent.
 */

export type PaymentTerms = "month_end" | "split" | "prepay";

export const TERMS_LABEL: Record<PaymentTerms, string> = {
  month_end: "End of month (invoice)",
  split: "50% upfront + 50% after delivery",
  prepay: "100% before the shoot",
};
export const TERMS_SHORT: Record<PaymentTerms, string> = {
  month_end: "End of month",
  split: "50% / 50%",
  prepay: "100% upfront",
};

/** What a client's booking summary needs (my_payment_terms). */
export type TermsView = {
  terms: PaymentTerms;
  vat_rate: number;
  cancel_free_hours: number;
  late_fee_pct: number;
  late_fee_min: number;
  work_keep_pct: number;
  /** Value packages (price access only): what's left this month. */
  package?: {
    name: string;
    allowance: number;
    half_day_cap: number;
    allowance_left: number;
    half_days_left: number;
  } | null;
};

export const DEFAULT_TERMS: TermsView = {
  terms: "prepay",
  vat_rate: 0,
  cancel_free_hours: 3,
  late_fee_pct: 50,
  late_fee_min: 250,
  work_keep_pct: 50,
  package: null,
};

const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Due now at booking: 100% or 50% of the estimate, VAT on top when registered. Nothing on end of
 * month or a package (they book like end of month), or when there's no estimate to charge.
 */
export function dueNow(
  terms: PaymentTerms,
  estimate: number | null | undefined,
  vatRate = 0,
): { pct: 0 | 50 | 100; subtotal: number; vat: number; total: number } {
  const pct = terms === "prepay" ? 100 : terms === "split" ? 50 : 0;
  if (!pct || !estimate || estimate <= 0) return { pct: 0, subtotal: 0, vat: 0, total: 0 };
  const subtotal = r2(pct === 100 ? estimate : estimate / 2);
  const vat = vatRate ? r2(subtotal * (vatRate / 100)) : 0;
  return { pct, subtotal, vat, total: r2(subtotal + vat) };
}

/**
 * A booking on a value package, worked out the way the month's ledger does it (private.value_ledger):
 * the extra is the larger of the part over what's left of the allowance and the share of the booking's
 * half-days over what's left of the cap.
 */
export function packageSplit(
  value: number,
  halfDays: number,
  left: { allowance_left: number; half_days_left: number },
) {
  let extra = Math.max(value - left.allowance_left, 0);
  const over = Math.max(halfDays - left.half_days_left, 0);
  if (halfDays > 0 && over > 0) extra = Math.max(extra, r2((value * over) / halfDays));
  extra = r2(Math.min(extra, value));
  return {
    included: r2(value - extra),
    extra,
    allowance_after: r2(Math.max(left.allowance_left - (value - extra), 0)),
    half_days_after: Math.max(left.half_days_left - Math.min(halfDays, left.half_days_left), 0),
  };
}

/**
 * Shoot days as people say them (owner, 24 Oct 2026): packages are set and shown in full days
 * (a half day is 0.5); the database counts half-days so 0.5 steps stay exact.
 */
export const dayCount = (halfDays: number) => {
  const d = Number(halfDays) / 2;
  return Number.isInteger(d) ? String(d) : d.toFixed(1);
};
export const shootDays = (halfDays: number) =>
  `${dayCount(halfDays)} shoot day${Number(halfDays) === 2 ? "" : "s"}`;

const DONE = ["delivered", "completed"];

/**
 * What the package has used, split for the meters (owner, 24 Oct 2026): completed (delivered, or a
 * late cancellation's half-day), booked (on the calendar, not delivered yet) and remaining. Value is
 * what the package covered of each booking; shoot days count up to the cap, in booking order (as the
 * ledger does).
 */
export function packageSplitUsage(v: {
  allowance: number;
  half_day_cap: number;
  bookings: { status: string; late_cancel: boolean; included: number; half_days: number }[];
}) {
  let capLeft = Number(v.half_day_cap);
  const aed = { done: 0, booked: 0 };
  const hd = { done: 0, booked: 0 };
  for (const b of v.bookings) {
    const done = DONE.includes(b.status) || b.late_cancel;
    const inc = Number(b.included);
    const h = Math.min(Number(b.half_days), capLeft);
    capLeft -= h;
    if (done) {
      aed.done += inc;
      hd.done += h;
    } else {
      aed.booked += inc;
      hd.booked += h;
    }
  }
  const allow = Number(v.allowance);
  const cap = Number(v.half_day_cap);
  return {
    aed: { ...aed, rest: Math.max(allow - aed.done - aed.booked, 0), total: allow },
    hd: { ...hd, rest: Math.max(cap - hd.done - hd.booked, 0), total: cap },
  };
}

/** Half-days a shoot uses: content shoots by slot (a full day is 2), property-only shoots none. */
export function halfDaysOf(o: { hasVideo: boolean; slot?: string | null; fullDay?: boolean }) {
  if (!o.hasVideo) return 0;
  return o.fullDay || o.slot === "full_day" || o.slot === "Full day" ? 2 : 1;
}

/* ---------- cancellations and reschedules ---------- */

export type ChangeKind = "cancel" | "reschedule";
/** Why: the client asked; or, at the door, our crew was already on the way / couldn't get in. */
export type ChangeReason = "client" | "late" | "en_route" | "no_access" | "admin";

export type PaidInvoice = {
  id: string;
  amount: number;
  refunded: number;
  paid_via: "stripe" | "bank" | "manual" | null;
};

export type ChangeInput = {
  kind: ChangeKind;
  type: "shoot" | "edit" | "avatar";
  status: string;
  /** Shoot start (ISO); null for edits and avatar videos. */
  start: string | null;
  now?: Date;
  /** The booking's value (logged items, else the estimate). */
  value: number;
  paid: PaidInvoice[];
  reason?: ChangeReason;
  /** A package client on the value model, and the half-days left this month. */
  onPackage?: boolean;
  halfDaysLeft?: number | null;
  settings: Pick<
    TermsView,
    "cancel_free_hours" | "late_fee_pct" | "late_fee_min" | "work_keep_pct"
  >;
  /** Edits/avatars after work started: what Milkywayy keeps (default the setting's %). Admin only. */
  keep?: number | null;
  /** Admin: waive the fee, or set it. */
  waive?: boolean;
  feeOverride?: number | null;
};

export type ChangeQuote = {
  allowed: boolean;
  /** Why not (shown instead of the button). */
  blocked?: string;
  late: boolean;
  /** The fee charged (after a waiver or override); a package client's late change uses a half-day instead. */
  fee: number;
  /** The fee before a waiver/override, for the admin. */
  standardFee: number;
  halfDays: number;
  paid: number;
  refund: number;
  /** Fee beyond what was paid: invoiced (or on the month-end invoice). */
  owed: number;
  refunds: { invoice_id: string; amount: number; stripe: boolean }[];
  /** One plain sentence for the dialog. */
  summary: string;
  /** Edits/avatars: what Milkywayy keeps after work started. */
  kept?: number;
};

const WORK_STARTED: Record<string, boolean> = {
  files_received: false,
  submitted: false,
  brief_received: false,
  in_editing: true,
  on_hold: true,
  script_ready: true,
  in_production: true,
};

const aed = (n: number) =>
  `AED ${n.toLocaleString("en-US", { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;

/** Spread a refund over the paid invoices (newest first), never more than is left on each. */
function spread(total: number, paid: PaidInvoice[]) {
  const out: ChangeQuote["refunds"] = [];
  let left = r2(total);
  for (const i of [...paid].reverse()) {
    if (left <= 0) break;
    const room = r2(Number(i.amount) - Number(i.refunded));
    const take = r2(Math.min(room, left));
    if (take > 0) out.push({ invoice_id: i.id, amount: take, stripe: i.paid_via === "stripe" });
    left = r2(left - take);
  }
  return out;
}

/**
 * The fee and refunds for a cancellation or reschedule.
 * Shoots: free more than `cancel_free_hours` before the start (unlimited reschedules, full refund).
 * Later than that, or our crew already on the way, or no access on arrival: `late_fee_pct` of the
 * booking, at least `late_fee_min`, never more than the booking; the rest of what was paid comes back.
 * A package client uses 1 half-day instead (the fee, if no half-day is left).
 * Edits and AI avatars: full refund before work starts; after, Milkywayy keeps `work_keep_pct` (or
 * what the admin sets); nothing back after delivery.
 */
export function quoteChange(c: ChangeInput): ChangeQuote {
  const now = c.now ?? new Date();
  const paid = r2(c.paid.reduce((n, i) => n + Number(i.amount) - Number(i.refunded), 0));
  const base = {
    late: false,
    fee: 0,
    standardFee: 0,
    halfDays: 0,
    paid,
    refund: 0,
    owed: 0,
    refunds: [],
  };
  if (["cancelled", "completed"].includes(c.status))
    return { ...base, allowed: false, blocked: "This can’t be changed any more.", summary: "" };

  if (c.type !== "shoot") {
    if (c.kind === "reschedule")
      return { ...base, allowed: false, blocked: "Only shoots can be rescheduled.", summary: "" };
    if (c.status === "delivered")
      return {
        ...base,
        allowed: false,
        blocked: "It’s been delivered, so it can’t be cancelled or refunded.",
        summary: "",
      };
    const started = WORK_STARTED[c.status] ?? false;
    const keepPct = Number(c.settings.work_keep_pct);
    const kept = started ? r2(Math.min(paid, Math.max(0, c.keep ?? (paid * keepPct) / 100))) : 0;
    const refund = r2(paid - kept);
    return {
      ...base,
      allowed: true,
      kept,
      refund,
      refunds: spread(refund, c.paid),
      summary: !started
        ? paid > 0
          ? `Work hasn’t started, so you get a full refund of ${aed(paid)}.`
          : "Work hasn’t started, so there’s nothing to pay."
        : paid > 0
          ? `Work has started: ${aed(kept)} is kept and ${aed(refund)} is refunded.`
          : "Work has started. We’ll confirm what’s charged.",
    };
  }

  if (c.status === "delivered")
    return { ...base, allowed: false, blocked: "It’s been delivered already.", summary: "" };
  const hoursLeft = c.start ? (new Date(c.start).getTime() - now.getTime()) / 36e5 : Infinity;
  const atDoor = c.reason === "en_route" || c.reason === "no_access" || c.reason === "late";
  const late = atDoor || hoursLeft < Number(c.settings.cancel_free_hours);
  const h = Number(c.settings.cancel_free_hours);
  const hrs = `${h} hour${h === 1 ? "" : "s"}`;
  if (!late) {
    const refunds = c.kind === "cancel" ? spread(paid, c.paid) : [];
    const refund = c.kind === "cancel" ? paid : 0;
    return {
      ...base,
      allowed: true,
      refund,
      refunds,
      summary:
        c.kind === "reschedule"
          ? `Free: more than ${hrs} before the shoot.`
          : refund > 0
            ? `Free: more than ${hrs} before the shoot. You get a full refund of ${aed(refund)}.`
            : `Free: more than ${hrs} before the shoot.`,
    };
  }
  const standardFee = r2(
    Math.min(
      Number(c.value),
      Math.max(
        (Number(c.value) * Number(c.settings.late_fee_pct)) / 100,
        Number(c.settings.late_fee_min),
      ),
    ),
  );
  const halfDay = !!c.onPackage && Number(c.halfDaysLeft ?? 0) >= 1;
  let fee = halfDay ? 0 : standardFee;
  let halfDays = halfDay ? 1 : 0;
  if (c.waive) {
    fee = 0;
    halfDays = 0;
  } else if (c.feeOverride != null && c.feeOverride >= 0) {
    fee = r2(c.feeOverride);
    halfDays = 0;
  }
  // On a reschedule nothing is refunded; the fee is charged on its own.
  const keepFromPaid = c.kind === "cancel" ? Math.min(paid, fee) : 0;
  const refund = c.kind === "cancel" ? r2(paid - keepFromPaid) : 0;
  const owed = r2(fee - keepFromPaid);
  const why =
    c.reason === "en_route"
      ? "Our crew was already on the way"
      : c.reason === "no_access"
        ? "We couldn’t access the property"
        : `It’s less than ${hrs} before the shoot`;
  const summary = c.waive
    ? `${why}, but the fee is waived.${refund > 0 ? ` ${aed(refund)} is refunded.` : ""}`
    : halfDays
      ? `${why}, so this uses half a shoot day from your package.${refund > 0 ? ` ${aed(refund)} is refunded.` : ""}`
      : `${why}, so a fee of ${aed(fee)} applies${c.feeOverride == null ? ` (${c.settings.late_fee_pct}% of the booking, minimum ${aed(Number(c.settings.late_fee_min))})` : ""}.${
          refund > 0 ? ` ${aed(refund)} is refunded.` : ""
        }${owed > 0 ? ` ${aed(owed)} will be invoiced.` : ""}`;
  return {
    allowed: true,
    late: true,
    fee,
    standardFee,
    halfDays,
    paid,
    refund,
    owed,
    refunds: spread(refund, c.paid),
    summary,
  };
}

/* ---------- booking terms ---------- */

/** Bump when the text below changes: clients accept the current version on their next booking. */
export const BOOKING_TERMS_VERSION = "2026-10-24";

export const BOOKING_TERMS: { title: string; text: string }[] = [
  {
    title: "Payment",
    text: "As set for your account (end of month, 50% upfront and the balance on delivery, or 100% before the shoot). Files unlock for download once the booking is paid in full.",
  },
  {
    title: "Cancellation",
    text: "Cancel or reschedule free up to 3 hours before the shoot. Within 3 hours, if our crew is already on the way, or if we can’t access the property on arrival, 50% of the booking is charged (minimum AED 250). Package clients use half a shoot day instead.",
  },
  {
    title: "Editing and AI avatars",
    text: "Full refund before work starts; partial refund after work has started; no refund after delivery.",
  },
  { title: "Revisions", text: "Two revision rounds per delivery are included." },
  {
    title: "Delivery times are estimates",
    text: "Photos within 24 hours, reels within 48 hours, long-form 48–72 hours.",
  },
  {
    title: "Usage rights",
    text: "You get the right to use the delivered media to market your property, business and brand. Milkywayy keeps the copyright and may show the work in its portfolio and marketing. Tell us if a project must stay private and we won’t show it.",
  },
  {
    title: "Access and permissions",
    text: "You confirm you have permission to shoot the property and that anyone appearing on camera has agreed.",
  },
  {
    title: "AI avatars",
    text: "An avatar based on a real person needs that person’s written consent.",
  },
];
