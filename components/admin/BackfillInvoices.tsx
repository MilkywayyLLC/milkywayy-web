"use client";

import { useState, useTransition } from "react";
import { backfillBookingInvoices } from "@/lib/portal/admin-payment-actions";

/** Admin → Billing → Settings: price and invoice bookings that were made without an estimate. */
export function BackfillInvoices() {
  const [rows, setRows] = useState<string[] | null>(null);
  const [msg, setMsg] = useState("");
  const [pending, start] = useTransition();
  const run = (dry: boolean) =>
    start(async () => {
      const r = await backfillBookingInvoices(dry);
      setMsg(r.ok ? (r.notice ?? "") : (r.error ?? "Couldn’t run it."));
      setRows(r.rows ?? null);
    });
  return (
    <section className="ad-card ad-form" aria-label="Bookings without an invoice">
      <h2 className="ad-h2">Bookings without an invoice</h2>
      <span className="ad-small ad-muted">
        Bookings made by teammates without price access had no estimate, so no invoice. Check lists
        them; Fix prices them at the company’s rates and issues the 50% / 100% invoice where it’s
        still requested or confirmed. Delivered work is only priced.
      </span>
      <div style={{ display: "flex", gap: 8 }}>
        <button type="button" className="ad-btn" disabled={pending} onClick={() => run(true)}>
          Check
        </button>
        {rows && rows.length > 0 && (
          <button
            type="button"
            className="ad-btn primary"
            disabled={pending}
            onClick={() => run(false)}
          >
            Fix {rows.length}
          </button>
        )}
      </div>
      {msg && <span className="ad-small">{msg}</span>}
      {rows && rows.length > 0 && (
        <ul className="ad-small">
          {rows.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      )}
    </section>
  );
}
