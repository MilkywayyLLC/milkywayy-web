import { dateLabel, money, monthLabel } from "@/lib/portal/billing";
import {
  dayCount,
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
  refunds: {
    amount: number;
    currency: string;
    method: string;
    status: string;
    created_at: string;
    ref: string | null;
  }[];
};

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

/** A meter in three parts: completed (gold), booked (light gold), remaining (dark grey). */
export function SegMeter({
  label,
  part,
  fmt,
  unit,
}: {
  label: string;
  part: { done: number; booked: number; rest: number; total: number };
  fmt: (n: number) => string;
  unit?: string;
}) {
  const pct = (n: number) => `${part.total > 0 ? Math.min(100, (n / part.total) * 100) : 0}%`;
  const used = part.done + part.booked;
  return (
    <div className="pt-seg" data-testid={`meter-${label.toLowerCase().replace(/\s+/g, "-")}`}>
      <div className="pt-row">
        <span>{label}</span>
        <span className="pt-mono">
          {fmt(used)} of {fmt(part.total)}
          {unit ? ` ${unit}` : ""}
        </span>
      </div>
      <span
        className="pt-seg-bar"
        role="meter"
        aria-label={`${label}: ${fmt(part.done)} completed, ${fmt(part.booked)} booked, ${fmt(part.rest)} remaining`}
        aria-valuemin={0}
        aria-valuemax={part.total}
        aria-valuenow={Math.min(used, part.total)}
      >
        <i className="done" style={{ width: pct(part.done) }} />
        <i className="booked" style={{ width: pct(part.booked) }} />
      </span>
      <span className="pt-seg-legend">
        <span>
          <i className="done" /> Completed {fmt(part.done)}
        </span>
        <span>
          <i className="booked" /> Booked {fmt(part.booked)}
        </span>
        <span>
          <i className="rest" /> Remaining {fmt(part.rest)}
        </span>
      </span>
    </div>
  );
}

/**
 * A value package's month (owner, 24 Oct 2026): the plan (name, monthly amount, renewal), AED and
 * shoot-day meters (completed / booked / remaining), extras so far, and this month's bookings with
 * their value and whether the package covers them.
 */
export function ValuePackageCard({ v, admin = false }: { v: ValueMonth; admin?: boolean }) {
  const m = (n: number) => money(v.currency, n);
  const num = (n: number) => Number(n).toLocaleString("en-US", { maximumFractionDigits: 2 });
  const u = packageSplitUsage(v);
  const extras = Number(v.extras_total);
  return (
    <section className="pt-card" aria-labelledby="vp-h" data-testid="value-package">
      <div className="pt-row" style={{ alignItems: "baseline", flexWrap: "wrap" }}>
        <div className="stack" style={{ gap: 2 }}>
          <span className="pt-eb">
            Your plan · {monthLabel(v.month)}
            {v.prorated ? " · pro-rated" : ""}
          </span>
          <h2 id="vp-h" className="pt-h2">
            {v.name}
          </h2>
        </div>
        <span className="pt-meta" data-testid="plan-amount">
          {m(Number(v.price))} a month · renews {dateLabel(v.renews_on)}
        </span>
      </div>
      <div className="pt-meters">
        <SegMeter label="Allowance" part={u.aed} fmt={(n) => m(n)} />
        <SegMeter label="Shoot days" part={u.hd} fmt={(n) => dayCount(n)} unit="days" />
      </div>
      <span className="pt-meta" data-testid="value-summary">
        {m(u.aed.done + u.aed.booked)} of {num(Number(v.allowance))} ·{" "}
        {dayCount(u.hd.done + u.hd.booked)} of {shootDays(Number(v.half_day_cap))}. A half day
        counts 0.5; property shoots use the allowance only. Once either runs out, more work is an
        extra on your month-end invoice.
      </span>
      <div className="pt-row" data-testid="value-extras">
        <b>Extras this month</b>
        <span className="pt-mono">{extras > 0 ? m(extras) : "None"}</span>
      </div>
      {v.bookings.length > 0 && (
        <div className="stack" style={{ gap: 6 }}>
          <span className="pt-eb">This month’s bookings</span>
          <div style={{ overflowX: "auto" }}>
            <table
              className="pt-table"
              aria-label="This month’s bookings"
              data-testid="value-bookings"
            >
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Project</th>
                  <th>Status</th>
                  <th>Value</th>
                  <th>Covered by</th>
                </tr>
              </thead>
              <tbody>
                {v.bookings.map((b) => (
                  <tr key={b.project_id}>
                    <td className="pt-mono">{dateLabel(b.date, { year: undefined })}</td>
                    <td>
                      {b.title ?? "Booking"}
                      <span className="pt-meta">
                        {" "}
                        · {b.ref}
                        {Number(b.half_days) > 0 ? ` · ${shootDays(Number(b.half_days))}` : ""}
                      </span>
                    </td>
                    <td>
                      {b.late_cancel ? "Late cancellation" : (STATUS_TEXT[b.status] ?? b.status)}
                    </td>
                    <td className="pt-mono">{b.late_cancel ? "—" : m(Number(b.value))}</td>
                    <td>
                      {Number(b.extra) <= 0
                        ? "Package"
                        : Number(b.included) > 0
                          ? `Package + extra ${m(Number(b.extra))}`
                          : `Extra ${m(Number(b.extra))}`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <ul className="pt-lines" aria-label="Statement so far" data-testid="value-statement">
        <li>
          <span>Package{v.prorated ? " (pro-rated)" : ""}</span>
          <span className="pt-mono">{m(Number(v.price))}</span>
        </li>
        <li>
          <span>Extras so far</span>
          <span className="pt-mono">{m(extras)}</span>
        </li>
        <li className="pt-lines-total">
          <b>Month-end invoice so far{admin ? "" : " (before VAT)"}</b>
          <b className="pt-mono">{m(Number(v.estimate))}</b>
        </li>
      </ul>
    </section>
  );
}

/** "How you pay" in plain words: the term and the ways to pay that are on for this client. */
export function HowYouPay({ bp, card }: { bp: BillingPayments; card: boolean }) {
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
      <span className="pt-eb">How you pay</span>
      <h2 id="hyp-h" className="pt-h2">
        {bp.value ? "Monthly package" : TERMS_LABEL[bp.terms]}
      </h2>
      <span>{text}</span>
      <span className="pt-meta">
        Pay by {waysText}. Upload the receipt on the invoice and we confirm it.
      </span>
    </section>
  );
}

/** The sidebar's plan card: the package with a thin AED meter, or how a pay-per-shoot client pays. */
export type RailPlan =
  | { kind: "package"; name: string; used: number; booked: number; total: number; text: string }
  | { kind: "payg"; text: string };

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
      text: `${money(bp.value.currency, u.aed.done + u.aed.booked)} of ${Number(u.aed.total).toLocaleString("en-US")} · ${dayCount(u.hd.done + u.hd.booked)} of ${shootDays(u.hd.total)}`,
    };
  }
  return {
    kind: "payg",
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
