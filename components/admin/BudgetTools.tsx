"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { budgetPct, dateLabel, money, monthLabel, type BudgetMonth } from "@/lib/portal/billing";
import {
  setBillingSwitches,
  setBudget,
  setClientRate,
  type BudgetResult,
} from "@/lib/portal/budget-actions";

export type BillingHistory = {
  mode: "payg" | "package" | "budget";
  budgets: {
    amount: number;
    effective_from: string;
    created_by: string | null;
    created_at: string;
  }[];
  rates: {
    key: string;
    label: string;
    amount: number;
    effective_from: string;
    created_by: string | null;
    created_at: string;
  }[];
  current_rates: { key: string; label: string; unit: string; amount: number | null }[];
  budget_month: BudgetMonth;
  show_budget: boolean;
  show_budget_set: boolean | null;
  payg_invoicing: "per_project" | "month_end";
  bill_in_advance: boolean | null;
};

function Note({ r, pending }: { r?: BudgetResult; pending?: boolean }) {
  if (pending) return <span className="ad-small ad-muted">Saving…</span>;
  if (!r) return null;
  return (
    <span className={r.ok ? "ad-small" : "ad-err"} role={r.ok ? "status" : "alert"}>
      {r.ok ? r.notice : r.error}
    </span>
  );
}

/** First days of this month and the next five, as YYYY-MM-01 (Dubai). */
function months() {
  const now = new Date(Date.now() + 4 * 3600_000);
  return Array.from({ length: 6 }, (_, i) => {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + i, 1));
    return d.toISOString().slice(0, 10);
  });
}

/**
 * Budget package (owner, 10 Oct 2026): a monthly amount in the client's currency, from a chosen
 * month (default next month), billed at month end (package + anything beyond it) or in advance.
 */
export function BudgetPanel({
  account,
  currency,
  h,
}: {
  account: string;
  currency: string;
  h: BillingHistory;
}) {
  const router = useRouter();
  const ms = months();
  const current = h.budgets.find((b) => b.effective_from <= ms[0]) ?? null;
  const [amount, setAmount] = useState(current ? String(Number(current.amount)) : "");
  const [from, setFrom] = useState(h.mode === "budget" ? ms[1] : ms[0]);
  const [advance, setAdvance] = useState(!!h.bill_in_advance);
  const [r, setR] = useState<BudgetResult>();
  const [pending, start] = useTransition();
  const bm = h.budget_month;
  return (
    <div className="ad-card" style={{ gap: 10 }} data-testid="budget-panel">
      <h3 className="ad-h3" style={{ margin: 0 }}>
        Budget package
      </h3>
      {h.mode === "budget" && bm.budget != null && (
        <div className="stack" style={{ gap: 4 }}>
          <span className="ad-small">
            {monthLabel(bm.month)}: <b>{money(currency, Number(bm.total))}</b> of{" "}
            {money(currency, Number(bm.budget))} · billed{" "}
            {h.bill_in_advance ? "in advance (package on the 1st)" : "at month end"}
          </span>
          <span className="ad-meter" aria-hidden="true">
            <i style={{ width: `${budgetPct(Number(bm.total), bm.budget)}%` }} />
          </span>
        </div>
      )}
      <form
        className="ad-grid3"
        aria-label="Budget package"
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            const res = await setBudget(account, Number(amount), from, advance);
            setR(res);
            if (res.ok) router.refresh();
          });
        }}
      >
        <div className="ad-field">
          <label htmlFor="bud-amount">Monthly amount ({currency})</label>
          <input
            id="bud-amount"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="10000"
          />
        </div>
        <div className="ad-field">
          <label htmlFor="bud-from">{h.mode === "budget" ? "Change from" : "Starts"}</label>
          <select id="bud-from" value={from} onChange={(e) => setFrom(e.target.value)}>
            {ms.map((m) => (
              <option key={m} value={m}>
                {monthLabel(m)}
              </option>
            ))}
          </select>
        </div>
        <div className="ad-field">
          <label className="ad-check">
            <input
              type="checkbox"
              checked={advance}
              onChange={(e) => setAdvance(e.target.checked)}
            />
            <span>Bill package in advance</span>
          </label>
          <span className="ad-help">
            Off: one invoice at month end (package + anything beyond it). On: package on the 1st,
            anything beyond it at month end.
          </span>
        </div>
        <div className="ad-btns" style={{ alignItems: "center" }}>
          <button type="submit" className="ad-btn small" disabled={pending}>
            {h.mode === "budget" ? "Save package" : "Put on a budget package"}
          </button>
          <Note r={r} pending={pending} />
        </div>
      </form>
      {h.budgets.length > 0 && (
        <details>
          <summary className="ad-small">Package history</summary>
          <ul className="ad-history" data-testid="budget-history">
            {h.budgets.map((b) => (
              <li key={b.effective_from}>
                {money(currency, Number(b.amount))}/month from {monthLabel(b.effective_from)}
                <span className="ad-muted">
                  {" "}
                  · set {dateLabel(b.created_at)}
                  {b.created_by ? ` by ${b.created_by}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

/**
 * The client's own rates (reels, long-form, any service on the rate card), each from a chosen
 * date (default the 1st of next month). Property shoots use the global price list instead.
 */
export function ClientRateHistory({
  account,
  currency,
  h,
}: {
  account: string;
  currency: string;
  h: BillingHistory;
}) {
  const ms = months();
  return (
    <div className="stack" style={{ gap: 8 }} data-testid="client-rates">
      <span className="ad-small ad-muted">
        A new rate applies to work logged from its date; anything already logged keeps its price.
        Property shoots are priced from Admin → Pricing → Property shoots.
      </span>
      {h.current_rates
        .filter((r) => r.key !== "shoot")
        .map((r) => (
          <RateRow key={r.key} account={account} currency={currency} rate={r} from={ms[1]} />
        ))}
      {h.rates.length > 0 && (
        <details>
          <summary className="ad-small">Rate history</summary>
          <ul className="ad-history" data-testid="rate-history">
            {h.rates.map((r) => (
              <li key={`${r.key}-${r.effective_from}`}>
                {r.label}: {money(currency, Number(r.amount))} from {dateLabel(r.effective_from)}
                <span className="ad-muted">
                  {" "}
                  · set {dateLabel(r.created_at)}
                  {r.created_by ? ` by ${r.created_by}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function RateRow({
  account,
  currency,
  rate,
  from: initialFrom,
}: {
  account: string;
  currency: string;
  rate: BillingHistory["current_rates"][number];
  from: string;
}) {
  const router = useRouter();
  const [amount, setAmount] = useState(rate.amount != null ? String(Number(rate.amount)) : "");
  const [from, setFrom] = useState(initialFrom);
  const [r, setR] = useState<BudgetResult>();
  const [pending, start] = useTransition();
  return (
    <form
      className="ad-rate-row"
      aria-label={`${rate.label} rate`}
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const res = await setClientRate(account, rate.key, Number(amount), from);
          setR(res);
          if (res.ok) router.refresh();
        });
      }}
    >
      <span>
        <b>{rate.label}</b>
        <span className="ad-small ad-muted">
          {" "}
          per {rate.unit} · now{" "}
          {rate.amount != null ? money(currency, Number(rate.amount)) : "not set"}
        </span>
      </span>
      <input
        aria-label={`${rate.label}: new rate`}
        inputMode="decimal"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
      />
      <input
        aria-label={`${rate.label}: applies from`}
        type="date"
        value={from}
        onChange={(e) => setFrom(e.target.value)}
      />
      <button type="submit" className="ad-btn ghost small" disabled={pending}>
        Save
      </button>
      <Note r={r} pending={pending} />
    </form>
  );
}

/** "Show budget and activity" and how pay-as-you-go work is invoiced. */
export function BillingSwitches({ account, h }: { account: string; h: BillingHistory }) {
  const router = useRouter();
  const [show, setShow] = useState<"auto" | "on" | "off">(
    h.show_budget_set == null ? "auto" : h.show_budget_set ? "on" : "off",
  );
  const [payg, setPayg] = useState(h.payg_invoicing);
  const [r, setR] = useState<BudgetResult>();
  const [pending, start] = useTransition();
  return (
    <form
      className="ad-grid2"
      aria-label="Client billing switches"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const res = await setBillingSwitches(
            account,
            show === "auto" ? null : show === "on",
            payg,
            null,
          );
          setR(res);
          if (res.ok) router.refresh();
        });
      }}
    >
      <div className="ad-field">
        <label htmlFor="sw-budget">Show budget and activity to the client</label>
        <select
          id="sw-budget"
          value={show}
          onChange={(e) => setShow(e.target.value as "auto" | "on" | "off")}
        >
          <option value="auto">
            Automatic ({h.mode === "budget" ? "on" : "off"} for this plan)
          </option>
          <option value="on">On</option>
          <option value="off">Off</option>
        </select>
        <span className="ad-help">
          Off: the client sees only invoices{h.mode === "package" ? " and usage counts" : ""}.
          Owners and admins only; members never see money.
        </span>
      </div>
      <div className="ad-field">
        <label htmlFor="sw-payg">Pay-as-you-go invoices</label>
        <select
          id="sw-payg"
          value={payg}
          onChange={(e) => setPayg(e.target.value as "per_project" | "month_end")}
        >
          <option value="per_project">One per project, when it’s delivered</option>
          <option value="month_end">One at month end</option>
        </select>
      </div>
      <div className="ad-btns" style={{ alignItems: "center" }}>
        <button type="submit" className="ad-btn ghost small" disabled={pending}>
          Save switches
        </button>
        <Note r={r} pending={pending} />
      </div>
    </form>
  );
}
