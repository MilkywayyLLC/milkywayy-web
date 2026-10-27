"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { cx } from "@/lib/cx";
import { useSaveSlot } from "./SaveGroup";
import { setRollover } from "@/lib/portal/admin-payment-actions";
import { ruleLabel, type RolloverRule } from "@/lib/portal/rollover";

/**
 * Package rollover (phase 1 part 4) on a package template or a client: on/off, "Roll over for"
 * 0–3 months, allowance and/or shoot days. Saved rules apply from next month; a client's own rule
 * beats the template's, and "Use the package's rule" drops it.
 */
type R = { ok: boolean; error?: string; notice?: string };

export type RolloverView = {
  now: RolloverRule;
  next: RolloverRule;
  next_month: string;
  override?: boolean;
};

export function RolloverSettings({
  packageId,
  account,
  data,
}: {
  packageId?: string;
  account?: string;
  data: RolloverView;
}) {
  const router = useRouter();
  const [on, setOn] = useState(data.next.enabled && data.next.months > 0);
  const [months, setMonths] = useState(data.next.months || 1);
  const [allowance, setAllowance] = useState(data.next.allowance);
  const [days, setDays] = useState(data.next.days);
  const [r, setR] = useState<R>();
  const [pending, start] = useTransition();
  const id = account ?? packageId ?? "x";
  const nextName = new Date(`${data.next_month}T12:00:00`).toLocaleDateString("en-GB", {
    month: "long",
  });
  const save = (rule: Parameters<typeof setRollover>[1]) =>
    start(async () => {
      const res = await setRollover({ packageId, account }, rule);
      setR(res);
      if (res.ok) router.refresh();
    });
  const n0 = data.next;
  const dirty =
    on !== (n0.enabled && n0.months > 0) ||
    months !== (n0.months || 1) ||
    allowance !== n0.allowance ||
    days !== n0.days;
  // On a client page it saves with the tab (admin redesign); on Packages it keeps its own button.
  const grouped = useSaveSlot(`rollover-${id}`, "Rollover", 30, dirty, () =>
    setRollover({ packageId, account }, { enabled: on, months, allowance, days }),
  );
  return (
    <form
      className="ad-card ad-form"
      aria-label="Rollover"
      data-testid="rollover-settings"
      onSubmit={(e) => {
        e.preventDefault();
        save({ enabled: on, months, allowance, days });
      }}
    >
      <h3 className="ad-h3">
        Rollover{" "}
        <span className="ad-small ad-muted">
          · this month: {ruleLabel(data.now)}
          {ruleLabel(data.next) !== ruleLabel(data.now)
            ? ` · from ${nextName}: ${ruleLabel(data.next)}`
            : ""}
          {account && data.now.source
            ? ` (${data.now.source === "client" ? "this client" : "package"})`
            : ""}
        </span>
      </h3>
      <label className="ad-check">
        <input type="checkbox" checked={on} onChange={(e) => setOn(e.target.checked)} />
        <span>Carry unused credit into the next months</span>
      </label>
      <div className={cx("ad-grid2", !on && "ad-muted")}>
        <div className="ad-field">
          <label htmlFor={`ro-m-${id}`}>Roll over for</label>
          <select
            id={`ro-m-${id}`}
            value={months}
            disabled={!on}
            onChange={(e) => setMonths(Number(e.target.value))}
          >
            {[0, 1, 2, 3].map((n) => (
              <option key={n} value={n}>
                {n} month{n === 1 ? "" : "s"}
              </option>
            ))}
          </select>
        </div>
        <fieldset className="ad-field" disabled={!on} style={{ border: 0, padding: 0, margin: 0 }}>
          <legend>What carries</legend>
          <label className="ad-check">
            <input
              type="checkbox"
              checked={allowance}
              onChange={(e) => setAllowance(e.target.checked)}
            />
            <span>Allowance (AED)</span>
          </label>
          <label className="ad-check">
            <input type="checkbox" checked={days} onChange={(e) => setDays(e.target.checked)} />
            <span>Shoot days</span>
          </label>
        </fieldset>
      </div>
      <span className="ad-small ad-muted">
        Changes apply from {nextName}; credit already carried keeps its expiry. Carried credit is
        used first, oldest first.
        {account ? " This client’s rule beats the package’s." : ""}
      </span>
      <div className="ad-btns ad-center">
        {!grouped && (
          <button type="submit" className="ad-btn small" disabled={pending}>
            Save rollover
          </button>
        )}
        {account && data.override && (
          <button
            type="button"
            className="ad-btn small ghost"
            disabled={pending}
            onClick={() => save({ useTemplate: true })}
          >
            Use the package’s rule
          </button>
        )}
        <span className={cx("ad-status", r && !r.ok && "error", r?.ok && "ok")} role="status">
          {pending ? "Saving…" : (r?.notice ?? r?.error)}
        </span>
      </div>
    </form>
  );
}
