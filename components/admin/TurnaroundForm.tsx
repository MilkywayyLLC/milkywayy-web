"use client";

import { useState, useTransition } from "react";
import {
  saveTurnaround,
  type BillingResult,
  type TurnaroundRow,
} from "@/lib/portal/admin-billing-actions";

/** Admin → Billing → Settings: "Usual turnaround" per service, shown in the client modals. */
export function TurnaroundForm({ rows }: { rows: TurnaroundRow[] }) {
  const [v, setV] = useState(Object.fromEntries(rows.map((r) => [r.key, r.text])));
  const [r, setR] = useState<BillingResult>();
  const [pending, start] = useTransition();
  return (
    <form
      className="ad-card ad-form"
      aria-label="Turnaround"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => setR(await saveTurnaround(v)));
      }}
    >
      <h2 className="ad-h2">Turnaround</h2>
      <span className="ad-small ad-muted">
        Shown to clients as “Usual turnaround: …” in the booking, editing and avatar forms.
      </span>
      {rows.map((row) => (
        <div className="ad-field" key={row.key}>
          <label htmlFor={`ta-${row.key}`}>{row.label}</label>
          <input
            id={`ta-${row.key}`}
            type="text"
            maxLength={120}
            value={v[row.key] ?? ""}
            onChange={(e) => setV({ ...v, [row.key]: e.target.value })}
          />
        </div>
      ))}
      <div className="ad-btns" style={{ alignItems: "center" }}>
        <button type="submit" className="ad-btn" disabled={pending}>
          Save turnaround
        </button>
        <span className={r?.ok ? "ad-small" : "ad-small ad-warn-text"} role="status">
          {pending ? "Saving…" : (r?.notice ?? r?.error)}
        </span>
      </div>
    </form>
  );
}
