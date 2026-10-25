import { dateLabel, money } from "@/lib/portal/billing";
import { shortTitle } from "@/lib/portal/projects";
import {
  aed0,
  dayCount,
  monthEndSoFar,
  packageSplitUsage,
  shootDays,
  TERMS_LABEL,
  type PaymentTerms,
} from "@/lib/portal/payments";
import { PaidByTransfer, PayNow } from "./InvoicePay";
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

export type ValueMonth = {
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

/** Pay this invoice: card (Stripe on and allowed), Wio, or "I've paid" with the receipt. */
export function PayActions({
  inv,
  card,
  payOnline,
  wio,
}: {
  inv: { id: string; number: string | null; stage?: string | null; payment_state?: string | null };
  card: boolean;
  payOnline: boolean;
  wio: string | null;
}) {
  if (inv.payment_state === "submitted") return null;
  const byCard = card && (payOnline || !!inv.stage);
  return (
    <>
      {byCard && <PayNow id={inv.id} number={inv.number ?? ""} />}
      {wio && (
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
      <PaidByTransfer id={inv.id} number={inv.number ?? ""} />
    </>
  );
}

/** Bank transfer details (and the Wio link), shown whenever something is unpaid. */
export function BankBox({ bank, wio }: { bank: BillingPayments["bank"]; wio: string | null }) {
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
    </div>
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
 * A value package's month (owner, 25 Oct 2026): name, monthly amount, renewal, the allowance and
 * shoot-day bars, extras this month, and the month-end invoice so far, line by line.
 */
export function ValuePackageCard({ v, admin = false }: { v: ValueMonth; admin?: boolean }) {
  const m = (n: number) => money(v.currency, n);
  const u = packageSplitUsage(v);
  const extras = aed0(v.extras_total);
  const so = monthEndSoFar(v);
  const LINE: Record<string, string> = {
    package: `${v.name}${v.prorated ? " (pro-rated)" : ""}`,
    extras: "Extras so far",
    before: "Work before the package started",
  };
  return (
    <section className="pt-card pt-plancard" aria-labelledby="vp-h" data-testid="value-package">
      <div className="pt-plan-head">
        <div>
          <span className="pt-eb">Your plan{v.prorated ? " · first month, pro-rated" : ""}</span>
          <h2 id="vp-h" className="pt-h2">
            {v.name}
          </h2>
        </div>
        <div className="pt-plan-amt" data-testid="plan-amount">
          <b className="pt-mono">{m(Number(v.price))}</b>{" "}
          <span className="pt-meta">a month · renews {dateLabel(v.renews_on)}</span>
        </div>
      </div>
      <Meter label="Allowance" part={u.aed} fmt={(n) => m(n)} />
      <Meter
        label="Shoot days"
        part={u.hd}
        fmt={(n) => `${dayCount(n)} ${n === 2 ? "day" : "days"}`}
      />
      <div className="pt-plan-row" data-testid="value-extras">
        <span>Extras this month</span>
        <span className="pt-mono">{extras > 0 ? m(extras) : "None"}</span>
      </div>
      <ul className="pt-lines" aria-label="Month-end invoice so far" data-testid="value-statement">
        {so.lines.map((l) => (
          <li key={l.key}>
            <span>{LINE[l.key]}</span>
            <span className="pt-mono">{m(l.amount)}</span>
          </li>
        ))}
        <li className="pt-lines-total">
          <b>Month-end invoice so far{admin ? "" : " (before VAT)"}</b>
          <b className="pt-mono">{m(so.total)}</b>
        </li>
      </ul>
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

/** "How you pay" in plain words, with the invoice-question line and WhatsApp link inside. */
export function HowYouPay({
  bp,
  card,
  chat,
}: {
  bp: BillingPayments;
  card: boolean;
  chat: string;
}) {
  const ways = [
    bp.bank ? "bank transfer" : null,
    bp.wio_link ? "Wio" : null,
    card && (bp.pay_online || bp.terms !== "month_end") ? "card" : null,
  ].filter(Boolean) as string[];
  const waysText =
    ways.length > 1
      ? `${ways.slice(0, -1).join(", ")} or ${ways[ways.length - 1]}`
      : (ways[0] ?? "bank transfer");
  const text = bp.value
    ? "Your package is billed at the end of each month, with any extras on the same invoice. Nothing is due when you book."
    : bp.terms === "month_end"
      ? "You book and we invoice everything at the end of the month. Nothing is due when you book."
      : bp.terms === "split"
        ? "You pay 50% when you book, which confirms the shoot. The other 50% is invoiced when we deliver; the files unlock for download once it’s paid."
        : "You pay 100% when you book, which confirms the shoot. The files are yours to download as soon as we deliver.";
  return (
    <section className="pt-card" aria-labelledby="hyp-h" data-testid="how-you-pay">
      <h2 id="hyp-h" className="pt-h2">
        How you pay
      </h2>
      <span>{text}</span>
      <span className="pt-meta">
        Pay by {waysText}. Upload the receipt on the invoice and we confirm it.
      </span>
      <div className="pt-plan-row pt-hyp-q">
        <span className="pt-meta">Something on an invoice? A real person replies.</span>
        <a className="btn btn-g btn-s" href={chat} target="_blank" rel="noopener noreferrer">
          WhatsApp us
        </a>
      </div>
    </section>
  );
}

/** The sidebar's plan card: the package with a thin AED meter, or how a pay-per-shoot client pays. */
export type RailPlan =
  | { kind: "package"; name: string; used: number; booked: number; total: number; text: string }
  | { kind: "payg"; text: string; upcoming?: string | null };

export function railPlanOf(bp: BillingPayments | null): RailPlan | null {
  if (!bp) return null;
  if (bp.value) {
    const u = packageSplitUsage(bp.value);
    return {
      kind: "package",
      name: bp.value.name,
      used: u.aed.done,
      booked: u.aed.booked,
      total: u.aed.total,
      text: `${money(bp.value.currency, u.aed.done + u.aed.booked)} of ${Number(u.aed.total).toLocaleString("en-US")} · ${dayCount(u.hd.done + u.hd.booked)} of ${dayCount(u.hd.total)} days`,
    };
  }
  return {
    kind: "payg",
    upcoming: upcomingText(bp.upcoming),
    text:
      bp.terms === "month_end"
        ? "Pay per shoot · invoiced monthly"
        : bp.terms === "split"
          ? "Pay per shoot · 50% upfront"
          : "Pay per shoot · 100% upfront",
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
        stage: "full" | "deposit" | "balance" | "fee";
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
            <div
              key={i.id}
              className="pt-inv"
              role="group"
              aria-label={`Invoice ${i.number ?? ""}`}
            >
              <div>
                <b>{STAGE[i.stage] ?? "Invoice"}</b>
                <div className="pt-meta">
                  {i.number}
                  {Number(i.refunded) > 0
                    ? ` · ${money(i.currency, Number(i.refunded))} refunded`
                    : ""}
                </div>
              </div>
              <span className="pt-mono">{money(i.currency, Number(i.amount))}</span>
              <Badge tone={i.status === "paid" ? "ok" : i.status === "overdue" ? "warn" : "gold"}>
                {i.payment_state === "submitted" && i.status !== "paid"
                  ? "Payment submitted"
                  : i.status === "paid"
                    ? "Paid"
                    : i.status === "overdue"
                      ? "Overdue"
                      : "Due"}
              </Badge>
              <span className="pt-inv-actions">
                {i.status !== "paid" && billing && (
                  <PayActions
                    inv={i}
                    card={card}
                    payOnline={billing.pay_online}
                    wio={billing.wio_link}
                  />
                )}
              </span>
            </div>
          ))}
        </div>
      )}
      {open.length > 0 && billing && !card && (
        <BankBox bank={billing.bank} wio={billing.wio_link} />
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
