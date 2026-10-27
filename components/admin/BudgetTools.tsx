"use client";

import { useState } from "react";
import { useSaveSlot } from "./SaveGroup";
import { budgetPct, dateLabel, money, monthLabel, type BudgetMonth } from "@/lib/portal/billing";
import { setBillingSwitches, setBudget } from "@/lib/portal/budget-actions";

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
  const ms = months();
  const current = h.budgets.find((b) => b.effective_from <= ms[0]) ?? null;
  const amount0 = current ? String(Number(current.amount)) : "";
  const [amount, setAmount] = useState(amount0);
  const [from, setFrom] = useState(h.mode === "budget" ? ms[1] : ms[0]);
  const [advance, setAdvance] = useState(!!h.bill_in_advance);
  // Legacy (admin redesign, 27 Oct 2026): shown only to a client already on a budget package.
  useSaveSlot(
    `budget-${account}`,
    "Budget",
    25,
    amount !== amount0 || advance !== !!h.bill_in_advance,
    () => setBudget(account, Number(amount), from, advance),
  );
  const bm = h.budget_month;
  return (
    <div className="ad-card ad-gap-12" data-testid="budget-panel">
      <h3 className="ad-h3 ad-m0">Budget package (legacy)</h3>
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
      <details>
        <summary className="ad-small">Change the budget</summary>
        <div className="ad-grid3" aria-label="Budget package">
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
            <label htmlFor="bud-from">Change from</label>
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
              Affects when the budget invoice is drafted: off, month end (package + extras); on,
              package on the 1st, extras at month end.
            </span>
          </div>
        </div>
      </details>
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
 * What the client sees (admin redesign, 27 Oct 2026): `accounts.show_budget`. Pay-as-you-go invoice
 * timing used to be here too; it has one control now, in Plan.
 */
export function BillingSwitches({ account, h }: { account: string; h: BillingHistory }) {
  const show0 = h.show_budget_set == null ? "auto" : h.show_budget_set ? "on" : "off";
  const [show, setShow] = useState<"auto" | "on" | "off">(show0);
  // Saved after Plan (order 20): switching plan rewrites show_budget with the stored value.
  useSaveSlot(`sees-${account}`, "Client sees", 50, show !== show0, () =>
    setBillingSwitches(account, show === "auto" ? null : show === "on", null, null),
  );
  return (
    <div className="ad-field" aria-label="Client billing switches">
      <label htmlFor="sw-budget">Show budget and activity to the client</label>
      <select
        id="sw-budget"
        value={show}
        onChange={(e) => setShow(e.target.value as "auto" | "on" | "off")}
      >
        <option value="auto">Automatic ({h.mode === "budget" ? "on" : "off"} for this plan)</option>
        <option value="on">On</option>
        <option value="off">Off</option>
      </select>
      <span className="ad-help">
        Affects the client’s Billing page. Off: only invoices
        {h.mode === "package" ? " and usage counts" : ""}. Members never see money.
      </span>
    </div>
  );
}
