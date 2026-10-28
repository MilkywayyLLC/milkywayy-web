import { dateLabel, money } from "@/lib/portal/billing";
import { shortTitle } from "@/lib/portal/projects";
import { carriedLines, carrySummary, type Carry } from "@/lib/portal/rollover";
import {
  BILLING_LABEL,
  billLine,
  carryNoticeLine,
  monthMode,
  planAmount,
  upfrontLater,
  type PlanMoney,
} from "@/lib/portal/plan";
import {
  aed0,
  dayCount,
  packageSplitUsage,
  shootDays,
  TERMS_LABEL,
  type PaymentTerms,
} from "@/lib/portal/payments";
import type { ReactNode } from "react";
import { Icon } from "./Icon";
import { PaidByTransfer, PayNow } from "./InvoicePay";
import { splitLabel } from "@/lib/portal/package-builder";
import { Badge } from "./ui";

/**
 * Payment terms on the client's pages (owner, 24 Oct 2026): how to pay an invoice (card when it's a
 * booking invoice or the client pays online, bank transfer, the optional Wio link, receipt upload),
 * the value package card on Billing, and the payment card on a project page.
 */
export type BillingPayments = {
  terms: PaymentTerms;
  account_terms: PaymentTerms;
  wio_link: string | null;
  pay_online: boolean;
  /** Bank transfer + receipt upload allowed for this client (admin toggle, phase 1; default on). */
  bank_transfer?: boolean;
  bank: {
    account_name: string | null;
    bank: string | null;
    iban: string;
    swift: string | null;
  } | null;
  value: ValueMonth | null;
  upcoming?: PlanUpcoming | null;
  refunds: {
    amount: number;
    currency: string;
    method: string;
    status: string;
    created_at: string;
    ref: string | null;
  }[];
};

export type PlanUpcoming = { name: string; starts_on: string; price: number; currency: string };

/** A package month, as private.plan_summary returns it (the same for the client and the admin). */
export type ValueMonth = PlanMoney & {
  name: string;
  price: number;
  currency: string;
  month: string;
  renews_on: string;
  prorated: boolean;
  allowance: number;
  half_day_cap: number;
  used: number;
  half_days_used: number;
  extras_total: number;
  estimate: number;
  /** Carried in from earlier months (phase 1 rollover); included in allowance / half_day_cap. */
  carry?: Carry | null;
  base_allowance?: number;
  base_half_day_cap?: number;
  /** Built packages (28 Oct 2026): hours (a half day is 4 h) and edits, included and used. */
  hours_included?: number | null;
  hours_used?: number | null;
  base_hours?: number | null;
  hours_split?: { full: number; half: number } | null;
  edits_included?: number | null;
  edits_used?: number | null;
  /** Package rate: extras (and pay-for-what-you-use months) at this discount. */
  rate_pct?: number | null;
  bookings: {
    project_id: string;
    ref: string | null;
    title: string | null;
    type: string;
    status: string;
    date: string;
    value: number;
    half_days: number;
    included: number;
    extra: number;
    late_cancel: boolean;
  }[];
};

/**
 * Pay this invoice (phase 1, 27 Oct 2026): card first (Stripe, on our own page) on every open invoice.
 * With card on, "I've paid" and Wio live only in the bank-transfer box (owner, 27 Oct 2026), never next
 * to Pay now; without card they're the invoice's own actions.
 */
export function PayActions({
  inv,
  card,
  wio,
}: {
  inv: { id: string; number: string | null; stage?: string | null; payment_state?: string | null };
  card: boolean;
  /** @deprecated kept for older callers; Stripe is on for every client now. */
  payOnline?: boolean;
  /** @deprecated the bank-transfer box decides now (BankBox `pay`). */
  bank?: boolean;
  wio: string | null;
}) {
  if (inv.payment_state === "submitted") return null;
  return (
    <>
      {card && <PayNow id={inv.id} number={inv.number ?? ""} />}
      {!card && wio && (
        <a
          className="btn btn-g btn-s pt-btn-sm"
          href={wio}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Pay invoice ${inv.number ?? ""} with Wio`}
        >
          Pay with Wio ↗
        </a>
      )}
      {!card && <PaidByTransfer id={inv.id} number={inv.number ?? ""} />}
    </>
  );
}

/**
 * Bank transfer details (and the Wio link), shown whenever something is unpaid. `pay`: the open
 * invoices it can take a receipt for ("I've paid"), when card is the main way to pay.
 */
export function BankBox({
  bank,
  wio,
  pay,
}: {
  bank: BillingPayments["bank"];
  wio: string | null;
  pay?: { id: string; number: string | null; payment_state?: string | null }[];
}) {
  const proof = (pay ?? []).filter((i) => i.payment_state !== "submitted");
  return (
    <div className="pt-card pt-bank" data-testid="bank">
      <span className="pt-eb">Pay by bank transfer</span>
      {bank ? (
        <dl>
          {bank.account_name && (
            <div>
              <dt>Account name</dt>
              <dd>{bank.account_name}</dd>
            </div>
          )}
          {bank.bank && (
            <div>
              <dt>Bank</dt>
              <dd>{bank.bank}</dd>
            </div>
          )}
          <div>
            <dt>IBAN</dt>
            <dd className="pt-mono">{bank.iban}</dd>
          </div>
          {bank.swift && (
            <div>
              <dt>SWIFT</dt>
              <dd className="pt-mono">{bank.swift}</dd>
            </div>
          )}
        </dl>
      ) : (
        <span className="pt-meta">WhatsApp us for our bank details.</span>
      )}
      {wio && (
        <span className="pt-meta">
          Or pay with Wio:{" "}
          <a href={wio} target="_blank" rel="noopener noreferrer">
            open the payment link ↗
          </a>
        </span>
      )}
      <span className="pt-meta">
        Put the invoice number in the reference, then tap “I’ve paid” and upload the receipt.
      </span>
      {proof.length > 0 && (
        <div className="pt-btns">
          {proof.map((i) => (
            <PaidByTransfer key={i.id} id={i.id} number={i.number ?? ""} named={proof.length > 1} />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * One invoice, compact (owner, 27 Oct 2026). Line 1: number · amount · status, never wrapped. Line 2:
 * the month and due date, small. Pay now and a PDF icon sit on the right, or below when there's no
 * room; Breakdown is a small link that opens underneath.
 */
export function InvoiceRow({
  number,
  amount,
  badge,
  meta,
  note,
  actions,
  breakdown,
}: {
  number: string;
  amount: string;
  badge: ReactNode;
  meta: ReactNode;
  note?: ReactNode;
  actions?: ReactNode;
  breakdown?: ReactNode;
}) {
  return (
    <div className="pt-ir" role="group" aria-label={`Invoice ${number}`}>
      <div className="pt-ir-info">
        <div className="pt-ir-l1">
          <b className="pt-ir-no">{number}</b>
          <span className="pt-ir-amt">{amount}</span>
          {badge}
        </div>
        <div className="pt-ir-l2">{meta}</div>
        {note}
      </div>
      {actions && <div className="pt-ir-act">{actions}</div>}
      {breakdown && (
        <details className="pt-ir-bd">
          <summary>Breakdown</summary>
          {breakdown}
        </details>
      )}
    </div>
  );
}

/** The PDF of an invoice we generate, as an icon button. */
export function PdfLink({ id, number }: { id: string; number: string }) {
  return (
    <a
      className="btn btn-g btn-s pt-btn-sm pt-ir-pdf"
      href={`/portal/billing/invoice/${id}`}
      download={`${number}.pdf`}
      aria-label={`Download ${number} (PDF)`}
    >
      <Icon name="download" size={16} />
    </a>
  );
}

const STATUS_TEXT: Record<string, string> = {
  requested: "Requested",
  confirmed: "Confirmed",
  shot: "Shot",
  editing: "In editing",
  delivered: "Delivered",
  completed: "Completed",
  cancelled: "Cancelled",
  submitted: "Submitted",
  files_received: "Files received",
  in_editing: "In editing",
  on_hold: "On hold",
  brief_received: "Brief received",
  script_ready: "Script ready",
  in_production: "In production",
};

/** A full-width bar in three parts: completed (gold), booked (light gold), remaining (dark grey). */
export function Meter({
  label,
  part,
  fmt,
}: {
  label: string;
  part: { done: number; booked: number; rest: number; total: number };
  fmt: (n: number) => string;
}) {
  const pct = (n: number) => `${part.total > 0 ? Math.min(100, (n / part.total) * 100) : 0}%`;
  const used = part.done + part.booked;
  return (
    <div className="pt-mtr" data-testid={`meter-${label.toLowerCase().replace(/\s+/g, "-")}`}>
      <div className="pt-mtr-top">
        <span>{label}</span>
        <span className="pt-mono">
          {fmt(used)} of {fmt(part.total)}
        </span>
      </div>
      <div
        className="pt-mtr-bar"
        role="meter"
        aria-label={`${label}: ${fmt(part.done)} completed, ${fmt(part.booked)} booked, ${fmt(part.rest)} left`}
        aria-valuemin={0}
        aria-valuemax={part.total}
        aria-valuenow={Math.min(used, part.total)}
      >
        <div className="pt-mtr-done" style={{ width: pct(part.done) }} />
        <div className="pt-mtr-booked" style={{ width: pct(part.booked) }} />
      </div>
      <div className="pt-mtr-label">
        {part.done > 0 && `${fmt(part.done)} completed · `}
        {fmt(part.booked)} booked · {fmt(part.rest)} left
      </div>
    </div>
  );
}

/** "Growth starts 1 Nov": a package that's set up but hasn't started yet. */
export const upcomingText = (u: PlanUpcoming | null | undefined) =>
  u ? `${u.name} starts ${dateLabel(u.starts_on, { year: undefined })}` : null;

/**
 * A value package's month (owner, 28 Oct 2026): the plan and how it's billed, the allowance and
 * shoot-day bars (with carried credit on upfront), the next invoice so far, and in the last 7 days of
 * an upfront month what carries over. `admin`: the rollover lines and the credits too.
 */
export function ValuePackageCard({ v, admin = false }: { v: ValueMonth; admin?: boolean }) {
  const m = (n: number) => money(v.currency, n);
  const u = packageSplitUsage(v);
  const mode = monthMode(v);
  const later = upfrontLater(v);
  const notice = carryNoticeLine(v);
  const extras = aed0(v.extras_total);
  // A built package (hours + edits); older value packages keep allowance + shoot days.
  const built = v.hours_included != null;
  // A half day is 4 hours.
  const hours = {
    done: u.hd.done * 4,
    booked: u.hd.booked * 4,
    rest: u.hd.rest * 4,
    total: u.hd.total * 4,
  };
  const eTotal = Number(v.edits_included ?? 0);
  const eUsed = Number(v.edits_used ?? 0);
  const edits = { done: 0, booked: eUsed, rest: Math.max(eTotal - eUsed, 0), total: eTotal };
  const rate = Number(v.rate_pct ?? 0);
  return (
    <section className="pt-card pt-plancard" aria-labelledby="vp-h" data-testid="value-package">
      <div className="pt-plan-head">
        <div>
          <span className="pt-eb" data-testid="plan-mode">
            Your plan · {BILLING_LABEL[mode]}
          </span>
          <h2 id="vp-h" className="pt-h2">
            {v.name}
          </h2>
        </div>
        <div className="pt-plan-amt" data-testid="plan-amount">
          <b className="pt-mono">{planAmount(v)}</b>
        </div>
      </div>
      {built ? (
        <>
          <Meter label="Shoot hours" part={hours} fmt={(n) => `${Math.round(n * 10) / 10} h`} />
          {v.hours_split && (v.hours_split.full > 0 || v.hours_split.half > 0) && (
            <span className="pt-meta" data-testid="plan-split">
              {splitLabel(v.hours_split.full, v.hours_split.half)} a month
            </span>
          )}
          {Number(v.edits_included ?? 0) > 0 && (
            <Meter label="Edits" part={edits} fmt={(n) => String(n)} />
          )}
          <Meter label="Value used" part={u.aed} fmt={(n) => m(n)} />
        </>
      ) : (
        <>
          <Meter label="Allowance" part={u.aed} fmt={(n) => m(n)} />
          <Meter
            label="Shoot days"
            part={u.hd}
            fmt={(n) => `${dayCount(n)} ${n === 2 ? "day" : "days"}`}
          />
        </>
      )}
      {carriedLines(v.currency, v.carry).map((l) => (
        <p key={l} className="pt-carried" data-testid="value-carried">
          {l}
        </p>
      ))}
      {admin && carrySummary(v.currency, v.carry).length > 0 && (
        <ul className="pt-lines" aria-label="Rollover this month" data-testid="value-rollover">
          {carrySummary(v.currency, v.carry).map((r) => (
            <li key={r.key}>
              <span>{r.label}</span>
              <span className="pt-mono">{r.value}</span>
            </li>
          ))}
        </ul>
      )}
      {mode === "upfront" && (
        <div className="pt-plan-row" data-testid="value-extras">
          <span>
            Extras this month{rate > 0 ? ` at package rates (${rate}% off)` : ""} (on next month’s
            invoice)
          </span>
          <span className="pt-mono">{extras > 0 ? m(extras) : "None"}</span>
        </div>
      )}
      {admin && mode === "usage" && (
        <ul
          className="pt-lines"
          aria-label="Month-end invoice so far"
          data-testid="value-statement"
        >
          <li>
            <span>
              Work this month at {rate > 0 ? `package rates (${rate}% off)` : "their prices"}
            </span>
            <span className="pt-mono">{m(aed0(v.usage_total ?? 0))}</span>
          </li>
          {Number(v.minimum ?? 0) > Number(v.usage_total ?? 0) && (
            <li>
              <span>Minimum monthly amount (top-up)</span>
              <span className="pt-mono">
                {m(aed0(Number(v.minimum) - Number(v.usage_total ?? 0)))}
              </span>
            </li>
          )}
          {(v.credits ?? []).map((c) => (
            <li key={`${c.number}-${c.ref}`}>
              <span>{c.description}</span>
              <span className="pt-mono">− {m(aed0(c.amount))}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="pt-plan-bill" data-testid="plan-bill">
        {billLine(v)}
      </p>
      {later && (
        <span className="pt-meta" data-testid="plan-upfront-later">
          {later}
        </span>
      )}
      {notice && (
        <p className="pt-carried pt-carry-notice" role="status" data-testid="carry-notice">
          {notice}
        </p>
      )}
    </section>
  );
}

/** This month's bookings on a package: short title, date, status, value, covered by. */
export function PackageBookings({ v }: { v: ValueMonth }) {
  const m = (n: number) => money(v.currency, n);
  if (!v.bookings.length) return null;
  return (
    <section className="pt-card" aria-labelledby="vb-h" data-testid="value-bookings">
      <h2 id="vb-h" className="pt-h2">
        This month’s bookings
      </h2>
      <div className="pt-blist">
        {v.bookings.map((b) => (
          <div key={b.project_id} className="pt-brow">
            <div className="pt-brow-main">
              <b>{shortTitle(b.title) || "Booking"}</b>
              <span className="pt-meta">
                {dateLabel(b.date, { year: undefined })} · {b.ref}
                {Number(b.half_days) > 0 ? ` · ${shootDays(Number(b.half_days))}` : ""}
              </span>
            </div>
            <span className="pt-brow-st">
              {b.late_cancel ? "Late cancellation" : (STATUS_TEXT[b.status] ?? b.status)}
            </span>
            <span className="pt-mono">{b.late_cancel ? "—" : m(Number(b.value))}</span>
            <span className="pt-brow-cov">
              {Number(b.extra) <= 0
                ? "Package"
                : Number(b.included) > 0
                  ? `Package + extra ${m(Number(b.extra))}`
                  : `Extra ${m(Number(b.extra))}`}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

/** "How you pay": one line, with the WhatsApp link for questions. */
export function HowYouPay({
  bp,
  card,
  chat,
}: {
  bp: BillingPayments;
  card: boolean;
  chat: string;
}) {
  const bank = bp.bank_transfer !== false || !card;
  const ways = [
    card ? "card" : null,
    bank && bp.bank ? "bank transfer" : null,
    bank && bp.wio_link ? "Wio" : null,
  ].filter(Boolean) as string[];
  const waysText =
    ways.length > 1
      ? `${ways.slice(0, -1).join(", ")} or ${ways[ways.length - 1]}`
      : (ways[0] ?? "bank transfer");
  const text = bp.value
    ? monthMode(bp.value) === "upfront"
      ? "Invoiced on the 1st of each month; extras go on the next invoice."
      : "Your package is billed at the end of each month for what you used."
    : bp.terms === "month_end"
      ? "We invoice at the end of the month."
      : bp.terms === "split"
        ? "You pay 50% when you book, the rest after delivery."
        : "You pay 100% when you book.";
  return (
    <p className="pt-meta" data-testid="how-you-pay" style={{ margin: 0 }}>
      <b>How you pay:</b> {text} Pay by {waysText}.{" "}
      <a className="lnk" href={chat} target="_blank" rel="noopener noreferrer">
        WhatsApp us
      </a>
    </p>
  );
}

/** The sidebar's plan card: package clients only (name + meters); pay-as-you-go has none. */
export type RailPlan = {
  name: string;
  used: number;
  booked: number;
  total: number;
  text: string;
};

export function railPlanOf(bp: BillingPayments | null): RailPlan | null {
  if (!bp?.value) return null;
  const u = packageSplitUsage(bp.value);
  return {
    name: bp.value.name,
    used: u.aed.done,
    booked: u.aed.booked,
    total: u.aed.total,
    text: `${money(bp.value.currency, u.aed.done + u.aed.booked)} of ${Number(u.aed.total).toLocaleString("en-US")} · ${dayCount(u.hd.done + u.hd.booked)} of ${dayCount(u.hd.total)} days`,
  };
}

export type MyProjectPayment = {
  locked: boolean;
  terms: PaymentTerms;
  start: string | null;
  cancelled: boolean;
  cancel_fee: number | null;
  fee_waived: boolean;
  sees_money: boolean;
  value: number | null;
  invoices:
    | {
        id: string;
        number: string | null;
        stage: "full" | "deposit" | "balance" | "fee" | "adjustment";
        amount: number;
        currency: string;
        status: "due" | "paid" | "overdue";
        refunded: number;
        payment_state: string | null;
      }[]
    | null;
  refunds: { amount: number; currency: string; method: string; status: string }[] | null;
};

const STAGE: Record<string, string> = {
  full: "Booking (100%)",
  deposit: "Deposit (50%)",
  balance: "Balance",
  fee: "Late change fee",
  adjustment: "After-shoot update",
};

/** A project's payment card: what's due, how to pay, the lock, and refunds. */
export function ProjectPaymentCard({
  pay,
  card,
  billing,
  banner,
}: {
  pay: MyProjectPayment;
  card: boolean;
  billing: BillingPayments | null;
  banner?: "paid" | "pay" | null;
}) {
  const inv = pay.invoices ?? [];
  const open = inv.filter((i) => i.status !== "paid");
  const refunds = pay.refunds ?? [];
  if (!inv.length && !pay.locked && !refunds.length && !banner) return null;
  return (
    <section className="pt-card" aria-labelledby="pay-h" data-testid="project-payment">
      <div className="pt-row">
        <h2 id="pay-h" className="pt-h2">
          Payment
        </h2>
        <span className="pt-meta">{TERMS_LABEL[pay.terms]}</span>
      </div>
      {banner === "paid" && (
        <p className="pt-note" role="status" style={{ margin: 0 }}>
          Thank you. Your card payment is going through; your booking is confirmed as soon as it
          lands, and we’ll email you.
        </p>
      )}
      {banner === "pay" && open.length > 0 && (
        <p className="pt-note" role="status" style={{ margin: 0 }}>
          The payment wasn’t completed. Pay below to confirm the booking.
        </p>
      )}
      {pay.locked && (
        <p className="pt-meta" data-testid="lock-banner" style={{ margin: 0 }}>
          Files unlock for download once the booking is paid in full. Until then you see previews.
        </p>
      )}
      {inv.length > 0 && (
        <div className="pt-list">
          {inv.map((i) => (
            <InvoiceRow
              key={i.id}
              number={i.number ?? "Invoice"}
              amount={money(i.currency, Number(i.amount))}
              badge={
                <Badge tone={i.status === "paid" ? "ok" : i.status === "overdue" ? "warn" : "gold"}>
                  {i.payment_state === "submitted" && i.status !== "paid"
                    ? "Submitted"
                    : i.status === "paid"
                      ? "Paid"
                      : i.status === "overdue"
                        ? "Overdue"
                        : "Due"}
                </Badge>
              }
              meta={
                <>
                  {STAGE[i.stage] ?? "Invoice"}
                  {Number(i.refunded) > 0
                    ? ` · ${money(i.currency, Number(i.refunded))} refunded`
                    : ""}
                </>
              }
              actions={
                i.status !== "paid" && billing ? (
                  <PayActions
                    inv={i}
                    card={card}
                    bank={billing.bank_transfer !== false}
                    wio={billing.wio_link}
                  />
                ) : null
              }
            />
          ))}
        </div>
      )}
      {open.length > 0 && billing && !card && (
        <BankBox bank={billing.bank} wio={billing.wio_link} />
      )}
      {open.length > 0 && billing && card && billing.bank_transfer !== false && (
        <details className="pt-breakdown">
          <summary>Pay by bank transfer instead</summary>
          <BankBox bank={billing.bank} wio={billing.wio_link} pay={open} />
        </details>
      )}
      {refunds.length > 0 && (
        <ul className="pt-lines" aria-label="Refunds">
          {refunds.map((r, n) => (
            <li key={n}>
              <span>Refund · {r.method === "stripe" ? "to your card" : "by bank transfer"}</span>
              <span className="pt-mono">
                {money(r.currency, Number(r.amount))} ·{" "}
                {r.status === "done"
                  ? "sent"
                  : r.status === "failed"
                    ? "being checked"
                    : "on its way"}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
