import { cx } from "@/lib/cx";
import { dateLabel, money, monthLabel } from "@/lib/portal/billing";
import { dayCount, shootDays, TERMS_LABEL, type PaymentTerms } from "@/lib/portal/payments";
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

const Meter = ({
  label,
  used,
  of,
  text,
}: {
  label: string;
  used: number;
  of: number;
  text: string;
}) => (
  <div className="pt-usage">
    <div className="pt-row">
      <span>{label}</span>
      <span className="pt-mono">{text}</span>
    </div>
    <span
      className={cx("pt-meter-bar", used > of && "over")}
      role="meter"
      aria-label={`${label}: ${text}`}
      aria-valuemin={0}
      aria-valuemax={of}
      aria-valuenow={Math.min(used, of)}
    >
      <i style={{ width: `${Math.min(100, (used / Math.max(1, of)) * 100)}%` }} />
    </span>
  </div>
);

const half = (n: number) => shootDays(Number(n));

/**
 * A value package's month (owner, 24 Oct 2026): AED used of the allowance, shoot days used of the cap
 * ("AED 6,400 of 10,000 · 2.5 of 4 shoot days"),
 * this month's bookings with their value, extras so far, and what the month-end invoice comes to.
 */
export function ValuePackageCard({ v, admin = false }: { v: ValueMonth; admin?: boolean }) {
  const m = (n: number) => money(v.currency, n);
  const used = Number(v.used);
  const hd = Number(v.half_days_used);
  const recent = [...v.bookings].reverse();
  return (
    <section className="pt-card" aria-labelledby="vp-h" data-testid="value-package">
      <div className="pt-row">
        <span className="pt-eb">
          Your package · {monthLabel(v.month)}
          {v.prorated ? " · pro-rated" : ""}
        </span>
        <span className="pt-meta">Renews {dateLabel(v.renews_on)}</span>
      </div>
      <h2 id="vp-h" className="pt-h2">
        {v.name}
      </h2>
      <div className="pt-meters">
        <Meter
          label="Allowance"
          used={used}
          of={Number(v.allowance)}
          text={`${m(used)} of ${m(Number(v.allowance))}`}
        />
        <Meter
          label="Shoot days"
          used={hd}
          of={Number(v.half_day_cap)}
          text={`${dayCount(hd)} of ${shootDays(Number(v.half_day_cap))}`}
        />
      </div>
      <span className="pt-meta" data-testid="value-summary">
        {m(used)} of {m(Number(v.allowance)).replace(/^[A-Z]{3} /, "")} · {dayCount(hd)} of{" "}
        {shootDays(Number(v.half_day_cap))}. A half day counts 0.5. Property shoots use the
        allowance only. Once either runs out, more work is an extra on your month-end invoice.
      </span>
      {recent.length > 0 && (
        <div className="stack" style={{ gap: 6 }}>
          <span className="pt-eb">This month</span>
          <ul className="pt-lines" aria-label="Bookings this month" data-testid="value-bookings">
            {recent.map((b) => (
              <li key={b.project_id}>
                <span>
                  {b.title ?? "Booking"}
                  <span className="pt-meta">
                    {" "}
                    · {b.ref} · {dateLabel(b.date, { year: undefined })}
                    {Number(b.half_days) > 0 ? ` · ${half(Number(b.half_days))}` : ""}
                    {b.late_cancel ? " · late cancellation" : ""}
                  </span>
                </span>
                <span className="pt-mono">
                  {b.late_cancel ? "—" : m(Number(b.value))}
                  {Number(b.extra) > 0 && (
                    <span className="pt-meta"> · extra {m(Number(b.extra))}</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <ul className="pt-lines" aria-label="Statement so far" data-testid="value-statement">
        <li>
          <span>Package{v.prorated ? " (pro-rated)" : ""}</span>
          <span className="pt-mono">{m(Number(v.price))}</span>
        </li>
        <li>
          <span>Extras so far</span>
          <span className="pt-mono">{m(Number(v.extras_total))}</span>
        </li>
        <li className="pt-lines-total">
          <b>Month-end invoice so far{admin ? "" : " (before VAT)"}</b>
          <b className="pt-mono">{m(Number(v.estimate))}</b>
        </li>
      </ul>
    </section>
  );
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
