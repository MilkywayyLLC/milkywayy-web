"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { cx } from "@/lib/cx";
import {
  adminApplyChange,
  adminQuoteChange,
  lockFiles,
  markProjectPaid,
  refundDone,
  retryStripeRefund,
  savePaymentSettings,
  setPackageValue,
  setPaymentTerms,
} from "@/lib/portal/admin-payment-actions";
import { money } from "@/lib/portal/billing";
import type { ProjectPayment } from "@/lib/portal/payment-actions";
import {
  BOOKING_TERMS_VERSION,
  shootDays,
  TERMS_LABEL,
  type ChangeKind,
  type ChangeQuote,
  type ChangeReason,
  type PaymentTerms,
} from "@/lib/portal/payments";
import { Confirm } from "./Confirm";

/**
 * Admin side of payment terms (owner, 24 Oct 2026): the client's term (set on the onboarding call),
 * a project's Payment card (invoices, lock, "Mark as paid / release files", terms acceptance, cancel
 * or reschedule with the fee shown and editable), the cancellation settings and the Refunds list.
 */
type R = { ok: boolean; error?: string; notice?: string };

function Note({ r, pending }: { r?: R; pending?: boolean }) {
  return (
    <span className={cx("ad-status", r && !r.ok && "error", r?.ok && "ok")} role="status">
      {pending ? "Saving…" : (r?.notice ?? r?.error)}
    </span>
  );
}

export type ClientPayments = {
  payment_terms: PaymentTerms;
  booking_terms: PaymentTerms;
  pay_online: boolean;
  pay_online_set: boolean | null;
  currency: string;
  package: {
    id: string;
    name: string;
    price: number;
    allowance: number | null;
    half_day_cap: number | null;
  } | null;
  templates: Record<string, { allowance: number | null; half_day_cap: number | null }>;
};

/** Admin → Client accounts → a client: Payment terms. */
export function PaymentTermsBlock({ account, data }: { account: string; data: ClientPayments }) {
  const router = useRouter();
  const [terms, setTerms] = useState<PaymentTerms>(data.payment_terms);
  const [r, setR] = useState<R>();
  const [pending, start] = useTransition();
  return (
    <form
      className="ad-card ad-form"
      aria-label="Payment terms"
      data-testid="payment-terms"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const res = await setPaymentTerms(account, terms);
          setR(res);
          if (res.ok) router.refresh();
        });
      }}
    >
      <h2 className="ad-h2">Payment terms</h2>
      <div className="ad-field">
        <label htmlFor="pay-terms">How this client pays</label>
        <select
          id="pay-terms"
          value={terms}
          onChange={(e) => setTerms(e.target.value as PaymentTerms)}
        >
          {(Object.keys(TERMS_LABEL) as PaymentTerms[]).map((k) => (
            <option key={k} value={k}>
              {TERMS_LABEL[k]}
            </option>
          ))}
        </select>
        <span className="ad-help">
          {terms === "month_end"
            ? "Books with “Request booking”; everything goes on the month-end invoice."
            : terms === "split"
              ? "Pays 50% when booking (that confirms it); the balance invoice goes out on delivery and the files unlock when it’s paid."
              : "Pays 100% when booking (that confirms it); files unlock on delivery."}
        </span>
      </div>
      {data.package && data.payment_terms !== "month_end" && (
        <p className="ad-note" style={{ margin: 0 }}>
          On a monthly package: bookings follow the package (nothing due at booking, extras at month
          end), whatever is set here.
        </p>
      )}
      <span className="ad-small ad-muted">
        Card payments on month-end invoices: {data.pay_online ? "on" : "off (bank transfer / Wio)"}.
        Change it with “Pay online” under Billing below. Booking invoices can always be paid by card
        once Stripe is on. New self-sign-ups start on 100% before the shoot.
      </span>
      <div className="ad-btns" style={{ alignItems: "center" }}>
        <button type="submit" className="ad-btn small" disabled={pending}>
          Save terms
        </button>
        <Note r={r} pending={pending} />
      </div>
    </form>
  );
}

export type AdminProjectPayment = Omit<ProjectPayment, "invoices"> & {
  account_terms: PaymentTerms | null;
  released_at: string | null;
  released_by: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
  cancel_fee: number | null;
  fee_waived: boolean;
  half_days_late: number;
  invoices: (ProjectPayment["invoices"][number] & {
    category: string | null;
    currency: string;
    paid_at: string | null;
    stripe: boolean;
    payment_state: string | null;
  })[];
  refunds: {
    id: string;
    amount: number;
    currency: string;
    method: string;
    status: string;
    stripe_refund_id: string | null;
    error: string | null;
    invoice_id: string | null;
  }[];
  acceptances: {
    user_name: string | null;
    email: string | null;
    version: string;
    accepted_at: string;
  }[];
};

const STAGE: Record<string, string> = {
  full: "Booking 100%",
  deposit: "Deposit 50%",
  balance: "Balance",
  fee: "Late fee",
};
const when = (t: string | null) =>
  t
    ? new Date(t).toLocaleString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Asia/Dubai",
      })
    : "—";

/** Admin → Projects → a project: Payment. */
export function ProjectPaymentAdmin({
  projectId,
  pay,
  currency,
}: {
  projectId: string;
  pay: AdminProjectPayment;
  currency: string;
}) {
  const router = useRouter();
  const [r, setR] = useState<R>();
  const [pending, start] = useTransition();
  const [change, setChange] = useState<ChangeKind | null>(null);
  const [confirmPaid, setConfirmPaid] = useState(false);
  const m = (n: number) => money(currency, Number(n));
  const unpaid = pay.invoices.filter((i) => i.stage && ["due", "overdue"].includes(i.status));
  const act = (f: () => Promise<R>) =>
    start(async () => {
      const res = await f();
      setR(res);
      if (res.ok) router.refresh();
    });
  const latest = pay.acceptances[pay.acceptances.length - 1];
  return (
    <section className="ad-card ad-form" aria-label="Payment" data-testid="project-payment-admin">
      <div className="ad-row" style={{ justifyContent: "space-between" }}>
        <h2 className="ad-h2">Payment</h2>
        <span className="ad-small ad-muted">
          {pay.terms ? TERMS_LABEL[pay.terms] : "—"}
          {pay.on_package ? " · package" : ""}
        </span>
      </div>
      <dl className="ad-dl">
        <dt>Value</dt>
        <dd>
          {m(pay.value)}
          {Number(pay.half_days) > 0 ? ` · ${shootDays(Number(pay.half_days))}` : ""}
        </dd>
        <dt>Files</dt>
        <dd data-testid="files-state">
          {pay.locked
            ? "Locked until paid"
            : pay.released_at
              ? `Released ${when(pay.released_at)} by ${pay.released_by ?? "admin"}`
              : "Unlocked"}
        </dd>
        <dt>Booking Terms</dt>
        <dd data-testid="terms-acceptance">
          {latest
            ? `Accepted v${latest.version} by ${latest.user_name || latest.email || "client"} (${latest.email ?? ""}), ${when(latest.accepted_at)}${
                latest.version !== BOOKING_TERMS_VERSION ? " · older version" : ""
              }`
            : "Not recorded (booked before terms, or by Milkywayy)"}
        </dd>
        {pay.cancelled_at && (
          <>
            <dt>Cancelled</dt>
            <dd>
              {when(pay.cancelled_at)} · {pay.cancel_reason}
              {pay.fee_waived
                ? " · fee waived"
                : Number(pay.cancel_fee) > 0
                  ? ` · fee ${m(Number(pay.cancel_fee))}`
                  : ""}
              {Number(pay.half_days_late) > 0
                ? ` · ${shootDays(Number(pay.half_days_late))} used`
                : ""}
            </dd>
          </>
        )}
      </dl>
      {pay.invoices.length > 0 && (
        <div className="ad-scroll">
          <table className="ad-table" aria-label="Invoices for this project">
            <thead>
              <tr>
                <th>Invoice</th>
                <th>What</th>
                <th>Amount</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {pay.invoices.map((i) => (
                <tr key={i.id}>
                  <td>
                    <a href={`/admin/billing/invoices/${i.id}`}>{i.number ?? "Draft"}</a>
                  </td>
                  <td>
                    {i.stage
                      ? STAGE[i.stage]
                      : i.category === "booking"
                        ? "Additional work"
                        : i.category}
                  </td>
                  <td className="ad-mono">
                    {m(i.amount)}
                    {Number(i.refunded) > 0 ? ` (−${m(i.refunded)} refunded)` : ""}
                  </td>
                  <td>
                    {i.status === "paid"
                      ? `Paid${i.paid_via ? ` · ${i.paid_via}` : ""}`
                      : i.status === "void"
                        ? "Cancelled"
                        : i.payment_state === "submitted"
                          ? "Receipt uploaded"
                          : i.status}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {pay.refunds.length > 0 && (
        <ul className="ad-small" aria-label="Refunds">
          {pay.refunds.map((x) => (
            <li key={x.id}>
              Refund {m(x.amount)} · {x.method} · {x.status === "due" ? "refund due" : x.status}
              {x.error ? ` · ${x.error}` : ""}
            </li>
          ))}
        </ul>
      )}
      <div className="ad-btns" style={{ alignItems: "center", flexWrap: "wrap" }}>
        {(unpaid.length > 0 || pay.locked) && (
          <button
            type="button"
            className="ad-btn small"
            disabled={pending}
            onClick={() => setConfirmPaid(true)}
          >
            Mark as paid / release files
          </button>
        )}
        {pay.locked && (
          <button
            type="button"
            className="ad-btn small ghost"
            disabled={pending}
            onClick={() => act(() => markProjectPaid(projectId, true))}
          >
            Release files only
          </button>
        )}
        {pay.released_at && unpaid.length > 0 && (
          <button
            type="button"
            className="ad-btn small ghost"
            disabled={pending}
            onClick={() => act(() => lockFiles(projectId))}
          >
            Lock again
          </button>
        )}
        {!["cancelled", "completed"].includes(pay.status) && (
          <>
            {pay.type === "shoot" && pay.status !== "delivered" && (
              <button
                type="button"
                className="ad-btn small ghost"
                onClick={() => setChange("reschedule")}
              >
                Reschedule
              </button>
            )}
            <button
              type="button"
              className="ad-btn small ghost"
              onClick={() => setChange("cancel")}
            >
              Cancel with fee…
            </button>
          </>
        )}
        <Note r={r} pending={pending} />
      </div>
      <Confirm
        open={confirmPaid}
        title="Mark as paid and release the files?"
        confirmLabel="Mark as paid"
        busy={pending}
        onCancel={() => setConfirmPaid(false)}
        onConfirm={() => {
          setConfirmPaid(false);
          act(() => markProjectPaid(projectId));
        }}
      >
        <p className="ad-small" style={{ margin: 0 }}>
          {unpaid.length
            ? `${unpaid.map((i) => `${i.number} (${m(i.amount)})`).join(", ")} will be marked paid, the client is emailed “Payment received”, and a waiting shoot is confirmed.`
            : "Nothing is unpaid: the files are released."}
        </p>
      </Confirm>
      {change && (
        <ChangeAdmin
          kind={change}
          projectId={projectId}
          type={pay.type}
          currency={currency}
          onClose={() => setChange(null)}
          onDone={(res) => {
            setR(res);
            setChange(null);
            router.refresh();
          }}
        />
      )}
    </section>
  );
}

const REASONS: [ChangeReason, string][] = [
  ["client", "Client asked (time decides the fee)"],
  ["late", "Late: under the free window"],
  ["en_route", "Crew already on the way"],
  ["no_access", "No access on arrival"],
  ["admin", "Our side (no fee)"],
];

export function ChangeAdmin({
  kind,
  projectId,
  type,
  currency,
  onClose,
  onDone,
  preview,
}: {
  kind: ChangeKind;
  projectId: string;
  type: "shoot" | "edit" | "avatar";
  currency: string;
  onClose: () => void;
  onDone: (r: R) => void;
  /** A worked-out quote to show without asking the server (screenshots). */
  preview?: ChangeQuote;
}) {
  const [reason, setReason] = useState<ChangeReason>("client");
  const [waive, setWaive] = useState(false);
  const [fee, setFee] = useState("");
  const [keep, setKeep] = useState("");
  const [method, setMethod] = useState<"bank" | "wio">("bank");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [q, setQ] = useState<ChangeQuote | null>(preview ?? null);
  const [err, setErr] = useState("");
  const [pending, start] = useTransition();
  const m = (n: number) => money(currency, n);
  const input = {
    reason,
    waive: waive || reason === "admin",
    fee: fee.trim() === "" ? null : Number(fee),
    keep: keep.trim() === "" ? null : Number(keep),
    refundMethod: method,
    date,
    startTime: time,
  };
  const key = JSON.stringify([reason, waive, fee, keep]);
  useEffect(() => {
    if (preview) return;
    let live = true;
    void adminQuoteChange(projectId, kind, JSON.parse(JSON.stringify(input))).then((res) => {
      if (!live) return;
      if (res.ok && res.quote) {
        setQ(res.quote);
        setErr("");
      } else setErr(res.error ?? "Couldn’t work it out.");
    });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the inputs that change the quote
  }, [key, projectId, kind, preview]);
  return (
    <Confirm
      open
      title={kind === "cancel" ? "Cancel this project" : "Reschedule this shoot"}
      confirmLabel={
        kind === "cancel"
          ? q && q.fee > 0
            ? `Cancel · fee ${m(q.fee)}`
            : "Cancel project"
          : "Reschedule"
      }
      danger={kind === "cancel"}
      busy={pending}
      onCancel={onClose}
      onConfirm={() =>
        start(async () => {
          const res = await adminApplyChange(projectId, kind, input);
          if (!res.ok) return setErr(res.error ?? "Couldn’t save.");
          onDone(res);
        })
      }
    >
      <div className="ad-form" data-testid="admin-change">
        {type === "shoot" && (
          <div className="ad-field">
            <label htmlFor="ch-reason">Why</label>
            <select
              id="ch-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value as ChangeReason)}
            >
              {REASONS.map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </select>
          </div>
        )}
        {kind === "reschedule" && (
          <div className="ad-grid2">
            <div className="ad-field">
              <label htmlFor="ch-date">New date</label>
              <input
                id="ch-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
            <div className="ad-field">
              <label htmlFor="ch-time">Start time</label>
              <input
                id="ch-time"
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
              />
            </div>
          </div>
        )}
        {q && (
          <div className="ad-note" data-testid="admin-quote" style={{ margin: 0 }}>
            <b>
              {q.fee > 0
                ? `Fee ${m(q.fee)}`
                : q.halfDays
                  ? "0.5 shoot day from the package"
                  : "No fee"}
            </b>
            {q.standardFee > 0 && q.fee !== q.standardFee && (
              <span className="ad-small"> (standard {m(q.standardFee)})</span>
            )}
            <div className="ad-small">
              Paid {m(q.paid)} · refund {m(q.refund)}
              {q.owed > 0 ? ` · ${m(q.owed)} to invoice` : ""}
              {q.kept != null ? ` · keep ${m(q.kept)}` : ""}
            </div>
          </div>
        )}
        {type === "shoot" ? (
          <div className="ad-grid2">
            <label className="ad-check">
              <input type="checkbox" checked={waive} onChange={(e) => setWaive(e.target.checked)} />{" "}
              Waive the fee
            </label>
            <div className="ad-field">
              <label htmlFor="ch-fee">Fee instead ({currency})</label>
              <input
                id="ch-fee"
                inputMode="decimal"
                value={fee}
                disabled={waive}
                placeholder={q ? String(q.standardFee) : ""}
                onChange={(e) => setFee(e.target.value)}
              />
            </div>
          </div>
        ) : (
          <div className="ad-field">
            <label htmlFor="ch-keep">We keep ({currency})</label>
            <input
              id="ch-keep"
              inputMode="decimal"
              value={keep}
              placeholder={q?.kept != null ? String(q.kept) : "0"}
              onChange={(e) => setKeep(e.target.value)}
            />
            <span className="ad-help">
              Before work starts: full refund. After: you choose (default keeps 50%).
            </span>
          </div>
        )}
        {q && q.refunds.some((x) => !x.stripe) && (
          <div className="ad-field">
            <label htmlFor="ch-method">Refund by</label>
            <select
              id="ch-method"
              value={method}
              onChange={(e) => setMethod(e.target.value as "bank" | "wio")}
            >
              <option value="bank">Bank transfer</option>
              <option value="wio">Wio</option>
            </select>
            <span className="ad-help">
              Shows as “Refund due” in Billing → Refunds until you tick it off.
            </span>
          </div>
        )}
        {q?.refunds.some((x) => x.stripe) && (
          <span className="ad-small ad-muted">
            Card payments are refunded through Stripe straight away.
          </span>
        )}
        {err && (
          <span className="ad-status error" role="alert">
            {err}
          </span>
        )}
      </div>
    </Confirm>
  );
}

export type PaymentSettings = {
  wio_link: string | null;
  cancel_free_hours: number;
  late_fee_pct: number;
  late_fee_min: number;
  work_keep_pct: number;
};

/** Admin → Billing → Settings: the Wio link and the cancellation values. */
export function PaymentSettingsForm({ s }: { s: PaymentSettings }) {
  const router = useRouter();
  const [v, setV] = useState({
    wio_link: s.wio_link ?? "",
    cancel_free_hours: String(s.cancel_free_hours),
    late_fee_pct: String(s.late_fee_pct),
    late_fee_min: String(s.late_fee_min),
    work_keep_pct: String(s.work_keep_pct),
  });
  const [r, setR] = useState<R>();
  const [pending, start] = useTransition();
  const field = (k: keyof typeof v, label: string, help?: string) => (
    <div className="ad-field">
      <label htmlFor={`ps-${k}`}>{label}</label>
      <input
        id={`ps-${k}`}
        inputMode={k === "wio_link" ? "url" : "decimal"}
        value={v[k]}
        placeholder={k === "wio_link" ? "https://…" : undefined}
        onChange={(e) => setV({ ...v, [k]: e.target.value })}
      />
      {help && <span className="ad-help">{help}</span>}
    </div>
  );
  return (
    <form
      className="ad-card ad-form"
      aria-label="Payments and cancellations"
      data-testid="payment-settings"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const res = await savePaymentSettings({
            wio_link: v.wio_link,
            cancel_free_hours: Number(v.cancel_free_hours),
            late_fee_pct: Number(v.late_fee_pct),
            late_fee_min: Number(v.late_fee_min),
            work_keep_pct: Number(v.work_keep_pct),
          });
          setR(res);
          if (res.ok) router.refresh();
        });
      }}
    >
      <h2 className="ad-h2">Payments and cancellations</h2>
      {field("wio_link", "Pay with Wio link (optional)", "Shown on invoices only when set.")}
      <div className="ad-grid2">
        {field("cancel_free_hours", "Free cancellation up to (hours before)")}
        {field("late_fee_pct", "Late fee (% of the booking)")}
        {field("late_fee_min", "Late fee minimum (AED)")}
        {field("work_keep_pct", "Edits / avatars after work starts: keep (%)")}
      </div>
      <span className="ad-small ad-muted">
        The Booking Terms text says 3 hours, 50% and AED 250: if you change these, tell me so the
        terms text (and its version) changes too.
      </span>
      <div className="ad-btns" style={{ alignItems: "center" }}>
        <button type="submit" className="ad-btn small" disabled={pending}>
          Save
        </button>
        <Note r={r} pending={pending} />
      </div>
    </form>
  );
}

export type RefundListRow = {
  id: string;
  account: string;
  ref: string | null;
  title: string | null;
  number: string | null;
  amount: number;
  currency: string;
  method: string;
  status: string;
  created_at: string;
  error: string | null;
  invoice_id: string | null;
  stripe_session?: string | null;
};

/** Admin → Billing → Refunds: "Refund due" tasks first. */
export function RefundsTable({ rows }: { rows: RefundListRow[] }) {
  const router = useRouter();
  const [r, setR] = useState<R>();
  const [pending, start] = useTransition();
  if (!rows.length) return <p className="ad-small ad-muted">No refunds yet.</p>;
  return (
    <>
      <div className="ad-scroll">
        <table className="ad-table" aria-label="Refunds" data-testid="refunds-table">
          <thead>
            <tr>
              <th>Client</th>
              <th>Project</th>
              <th>Invoice</th>
              <th>Amount</th>
              <th>How</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((x) => (
              <tr key={x.id}>
                <td>{x.account}</td>
                <td>{[x.ref, x.title].filter(Boolean).join(" · ")}</td>
                <td>{x.number ?? "—"}</td>
                <td className="ad-mono">{money(x.currency, Number(x.amount))}</td>
                <td>{x.method}</td>
                <td>
                  {x.status === "due" ? <b>Refund due</b> : x.status}
                  {x.error ? <div className="ad-small ad-muted">{x.error}</div> : null}
                </td>
                <td>
                  {x.status === "due" && (
                    <button
                      type="button"
                      className="ad-btn small"
                      disabled={pending}
                      onClick={() =>
                        start(async () => {
                          const res = await refundDone(x.id);
                          setR(res);
                          if (res.ok) router.refresh();
                        })
                      }
                    >
                      Mark refunded
                    </button>
                  )}
                  {x.status === "failed" && x.method === "stripe" && x.stripe_session && (
                    <button
                      type="button"
                      className="ad-btn small ghost"
                      disabled={pending}
                      onClick={() =>
                        start(async () => {
                          const res = await retryStripeRefund({
                            id: x.id,
                            amount: x.amount,
                            stripe: true,
                            session: x.stripe_session!,
                          });
                          setR(res);
                          if (res.ok) router.refresh();
                        })
                      }
                    >
                      Retry
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Note r={r} pending={pending} />
    </>
  );
}

/**
 * A package's two limits (owner, 24 Oct 2026), on every monthly package (templates and clients'
 * own): the AED allowance and shoot days in full days (a half day is 0.5). Reached when either runs
 * out; after that, extras on the month-end invoice.
 */
export function PackageLimits({
  packageId,
  currency,
  allowance,
  halfDayCap,
  account,
}: {
  packageId: string;
  currency: string;
  allowance: number | null;
  halfDayCap: number | null;
  account?: string | null;
}) {
  const router = useRouter();
  const [aed, setAed] = useState(allowance != null ? String(Number(allowance)) : "");
  const [days, setDays] = useState(halfDayCap != null ? String(Number(halfDayCap) / 2) : "");
  const [r, setR] = useState<R>();
  const [pending, start] = useTransition();
  return (
    <form
      className="ad-card ad-form"
      aria-label="Package limits"
      data-testid="package-limits"
      onSubmit={(e) => {
        e.preventDefault();
        const d = Number(days);
        if (days.trim() !== "" && (!(d >= 0) || Math.round(d * 2) !== d * 2))
          return setR({ ok: false, error: "Shoot days in steps of 0.5." });
        start(async () => {
          const res = await setPackageValue(
            packageId,
            aed.trim() === "" ? null : Number(aed),
            days.trim() === "" ? null : Math.round(d * 2),
            account ?? undefined,
          );
          setR(res);
          if (res.ok) router.refresh();
        });
      }}
    >
      <div className="ad-grid2">
        <div className="ad-field">
          <label htmlFor={`pl-aed-${packageId}`}>Allowance ({currency} a month)</label>
          <input
            id={`pl-aed-${packageId}`}
            inputMode="decimal"
            value={aed}
            placeholder="10000"
            onChange={(e) => setAed(e.target.value)}
          />
        </div>
        <div className="ad-field">
          <label htmlFor={`pl-days-${packageId}`}>Shoot days a month (full days)</label>
          <input
            id={`pl-days-${packageId}`}
            type="number"
            min={0}
            step={0.5}
            value={days}
            placeholder="4"
            onChange={(e) => setDays(e.target.value)}
          />
        </div>
      </div>
      <span className="ad-small ad-muted">
        Each booking uses its value; content shoots also use their days (half day 0.5, full day 1).
        Reached when either runs out; after that, extras on the month-end invoice.
      </span>
      <div className="ad-btns" style={{ alignItems: "center" }}>
        <button type="submit" className="ad-btn small" disabled={pending}>
          Save limits
        </button>
        <Note r={r} pending={pending} />
      </div>
    </form>
  );
}
