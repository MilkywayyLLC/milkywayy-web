"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createBatch } from "@/lib/portal/pay-actions";
import { dateLabel, money } from "@/lib/portal/billing";

export type DueInvoice = {
  id: string;
  number: string;
  amount: number;
  due_on: string;
  refs: string[];
};

/**
 * "Pay all due · AED X" (2 Nov 2026): the due invoices as checkboxes (all ticked), one button that opens a
 * single payment over the ticked ones (card or one bank transfer), and a combined statement PDF.
 * Each invoice keeps its own Pay button below.
 */
export function PayAll({ invoices, currency }: { invoices: DueInvoice[]; currency: string }) {
  const router = useRouter();
  const [picked, setPicked] = useState<Set<string>>(() => new Set(invoices.map((i) => i.id)));
  const [err, setErr] = useState("");
  const [pending, start] = useTransition();
  const chosen = invoices.filter((i) => picked.has(i.id));
  const total = chosen.reduce((t, i) => t + Number(i.amount), 0);
  const ids = chosen.map((i) => i.id);
  return (
    <div className="stack" style={{ gap: 8 }} data-testid="pay-all">
      <ul className="pt-lines" aria-label="Invoices to pay">
        {invoices.map((i) => (
          <li key={i.id}>
            <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input
                type="checkbox"
                checked={picked.has(i.id)}
                onChange={(e) =>
                  setPicked((p) => {
                    const n = new Set(p);
                    if (e.target.checked) n.add(i.id);
                    else n.delete(i.id);
                    return n;
                  })
                }
              />
              <span>
                <span className="pt-mono">{i.number}</span>
                {i.refs.length > 0 && ` · ${i.refs.join(", ")}`}
                <span className="pt-meta"> · Due {dateLabel(i.due_on, { year: undefined })}</span>
              </span>
            </label>
            <span className="pt-mono">{money(currency, Number(i.amount))}</span>
          </li>
        ))}
      </ul>
      <div className="pt-btns">
        <button
          type="button"
          className="btn btn-p btn-s"
          disabled={pending || !ids.length}
          onClick={() =>
            start(async () => {
              setErr("");
              const r = await createBatch(ids);
              if (r.ok && r.id) router.push(`/portal/pay/all/${r.id}`);
              else setErr(r.error ?? "Couldn’t start the payment.");
            })
          }
        >
          {pending ? "Opening…" : `Pay all due · ${money(currency, total)}`}
        </button>
        <a
          className="btn btn-g btn-s"
          href={`/portal/billing/statement?ids=${ids.join(",")}`}
          download="Milkywayy-statement.pdf"
          aria-disabled={!ids.length}
        >
          Statement (PDF)
        </a>
      </div>
      {err && (
        <span className="pt-error" role="alert">
          {err}
        </span>
      )}
    </div>
  );
}
