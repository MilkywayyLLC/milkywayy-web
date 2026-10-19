"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { uploadFile } from "@/lib/upload-browser";
import { startInvoiceUpload } from "@/lib/portal/admin-billing-actions";
import { money, type InvoiceLine } from "@/lib/portal/billing";
import {
  approveInvoice,
  deleteDraft,
  generateDrafts,
  refreshDraft,
  saveDraft,
  type InvoiceResult,
} from "@/lib/portal/invoice-actions";

function Note({ r, pending }: { r?: InvoiceResult; pending?: boolean }) {
  if (pending) return <span className="ad-small ad-muted">Working…</span>;
  if (!r) return null;
  return (
    <span className={r.ok ? "ad-small" : "ad-err"} role={r.ok ? "status" : "alert"}>
      {r.ok ? r.notice : r.error}
    </span>
  );
}

export type DraftData = {
  id: string;
  account_id: string;
  number: string | null;
  status: "draft" | "approved";
  category: string;
  currency: "AED" | "USD";
  lines: InvoiceLine[];
  note: string | null;
  due_on: string;
  publish_on: string | null;
  pdf_source: "generated" | "ledger";
  pdf_key: string | null;
  vat_rate: number;
  advance: boolean;
  basis_total: number | null;
  activity_total: number | null;
};

type Row = {
  description: string;
  qty: string;
  unit_price: string;
  line_item_id?: string;
  kind?: string;
};

/**
 * One draft: lines (description, quantity, price), note, due date, VAT (when the business is VAT
 * registered, 5% on top), and which PDF the client gets (generated from these lines, or a PDF
 * from Milkywayy Ledger). Approve (publishes on its date) or Approve & publish now.
 */
export function DraftEditor({ inv, vatOn }: { inv: DraftData; vatOn: boolean }) {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>(
    inv.lines.map((l) => ({
      description: l.description,
      qty: String(Number(l.qty)),
      unit_price: String(Number(l.unit_price)),
      line_item_id: l.line_item_id,
      kind: l.kind,
    })),
  );
  const [note, setNote] = useState(inv.note ?? "");
  const [due, setDue] = useState(inv.due_on.slice(0, 10));
  const [source, setSource] = useState(inv.pdf_source);
  const [pdfKey, setPdfKey] = useState<string | null>(inv.pdf_key);
  const [file, setFile] = useState<File | null>(null);
  const [r, setR] = useState<InvoiceResult>();
  const [pending, start] = useTransition();
  const [sure, setSure] = useState(false);
  const c = inv.currency;
  const num = (s: string) => (s.trim() === "" ? NaN : Number(s));
  const sub = rows.reduce(
    (t, x) => t + (Math.round(num(x.qty) * num(x.unit_price) * 100) / 100 || 0),
    0,
  );
  const vat = vatOn ? Math.round(sub * 5) / 100 : 0;
  const set = (i: number, patch: Partial<Row>) =>
    setRows((rs) => rs.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const changed =
    inv.status === "draft" &&
    inv.activity_total != null &&
    inv.basis_total != null &&
    Math.abs(Number(inv.activity_total) - Number(inv.basis_total)) > 0.005;

  async function persist() {
    let key = pdfKey;
    if (source === "ledger" && file) {
      const ok = await uploadFile(
        file,
        `invoice-${inv.account_id}`,
        {
          start: async () => {
            const p = await startInvoiceUpload(inv.account_id, file.name, file.size);
            if (p.ok) key = p.key;
            return p;
          },
          resume: async () => ({ ok: false, error: "Upload again." }),
          finish: async () => ({ ok: true }),
        },
        () => undefined,
      );
      if (!ok) return { ok: false, error: "The PDF didn’t upload. Try again." } as InvoiceResult;
      setPdfKey(key);
    }
    return saveDraft(inv.id, {
      lines: rows.map((x) => ({
        description: x.description,
        qty: num(x.qty),
        unit_price: num(x.unit_price),
        amount: 0,
        line_item_id: x.line_item_id,
        kind: x.kind,
      })),
      note,
      due,
      pdfSource: source,
      pdfKey: key,
    });
  }

  return (
    <form
      className="ad-card ad-form"
      aria-label="Invoice draft"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const res = await persist();
          setR(res);
          if (res.ok) router.refresh();
        });
      }}
    >
      {changed && (
        <p className="ad-note warn" data-testid="draft-changed" style={{ margin: 0 }}>
          More work was logged after this draft was made ({money(c, Number(inv.basis_total))} →{" "}
          {money(c, Number(inv.activity_total))}).{" "}
          <button
            type="button"
            className="ad-btn small ghost"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const res = await refreshDraft(inv.id);
                setR(res);
                if (res.ok) router.refresh();
              })
            }
          >
            Rebuild from activity
          </button>
        </p>
      )}
      <div className="ad-inv-lines" role="table" aria-label="Lines">
        <div role="row" className="ad-inv-line ad-th">
          <span role="columnheader">Description</span>
          <span role="columnheader">Qty</span>
          <span role="columnheader">Unit price</span>
          <span role="columnheader">Amount</span>
          <span />
        </div>
        {rows.map((x, i) => (
          <div role="row" className="ad-inv-line" key={i} data-testid="draft-line">
            <input
              aria-label={`Line ${i + 1} description`}
              value={x.description}
              maxLength={200}
              onChange={(e) => set(i, { description: e.target.value })}
            />
            <input
              aria-label={`Line ${i + 1} quantity`}
              inputMode="decimal"
              value={x.qty}
              onChange={(e) => set(i, { qty: e.target.value })}
            />
            <input
              aria-label={`Line ${i + 1} unit price`}
              inputMode="decimal"
              value={x.unit_price}
              onChange={(e) => set(i, { unit_price: e.target.value })}
            />
            <span className="ad-mono" role="cell">
              {Number.isFinite(num(x.qty) * num(x.unit_price))
                ? money(c, Math.round(num(x.qty) * num(x.unit_price) * 100) / 100)
                : "—"}
            </span>
            <button
              type="button"
              className="ad-icon-btn"
              aria-label={`Remove line ${i + 1}`}
              onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}
            >
              ×
            </button>
          </div>
        ))}
      </div>
      <div className="ad-btns">
        <button
          type="button"
          className="ad-btn ghost small"
          onClick={() => setRows((rs) => [...rs, { description: "", qty: "1", unit_price: "" }])}
        >
          Add a line
        </button>
      </div>
      <dl className="ad-inv-totals" data-testid="draft-totals">
        {vatOn && (
          <>
            <div>
              <dt>Subtotal</dt>
              <dd>{money(c, sub)}</dd>
            </div>
            <div>
              <dt>VAT 5%</dt>
              <dd>{money(c, vat)}</dd>
            </div>
          </>
        )}
        <div>
          <dt>
            <b>Total</b>
          </dt>
          <dd>
            <b data-testid="draft-total">{money(c, sub + vat)}</b>
          </dd>
        </div>
      </dl>
      <div className="ad-grid2">
        <div className="ad-field">
          <label htmlFor="inv-due">Due date</label>
          <input id="inv-due" type="date" value={due} onChange={(e) => setDue(e.target.value)} />
        </div>
        <div className="ad-field">
          <label htmlFor="inv-note">Note on the invoice (optional)</label>
          <input
            id="inv-note"
            value={note}
            maxLength={500}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. Thank you for October"
          />
        </div>
      </div>
      <fieldset className="ad-field">
        <legend className="ad-label">PDF the client gets</legend>
        <div className="ad-checks">
          <label className="ad-check">
            <input
              type="radio"
              name="pdf"
              checked={source === "generated"}
              onChange={() => setSource("generated")}
            />
            <span>Made from these lines</span>
          </label>
          <label className="ad-check">
            <input
              type="radio"
              name="pdf"
              checked={source === "ledger"}
              onChange={() => setSource("ledger")}
            />
            <span>A PDF from Milkywayy Ledger instead</span>
          </label>
        </div>
        {source === "ledger" && (
          <>
            <input
              type="file"
              accept="application/pdf,.pdf"
              aria-label="Ledger PDF"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            {pdfKey && !file && <span className="ad-small">A Ledger PDF is attached.</span>}
          </>
        )}
      </fieldset>
      <div className="ad-savebar">
        <Note r={r} pending={pending} />
        <button type="submit" className="ad-btn ghost" disabled={pending}>
          Save draft
        </button>
        <a
          className="ad-btn quiet"
          href={`/admin/billing/invoices/${inv.id}/pdf`}
          target="_blank"
          rel="noopener"
        >
          Preview PDF
        </a>
        <button
          type="button"
          className="ad-btn ghost"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const s = await persist();
              if (!s.ok) return setR(s);
              const res = await approveInvoice(inv.id, false);
              setR(res);
              if (res.ok) router.refresh();
            })
          }
        >
          {inv.status === "approved" ? "Save approval" : "Approve"}
        </button>
        <button
          type="button"
          className="ad-btn"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const s = await persist();
              if (!s.ok) return setR(s);
              const res = await approveInvoice(inv.id, true);
              setR(res);
              if (res.ok) router.refresh();
            })
          }
        >
          Approve &amp; publish now
        </button>
        <button
          type="button"
          className="ad-btn quiet"
          disabled={pending}
          onClick={() =>
            sure
              ? start(async () => {
                  const res = await deleteDraft(inv.id);
                  setR(res);
                  if (res.ok) router.replace("/admin/billing?deleted=1");
                })
              : setSure(true)
          }
        >
          {sure ? "Really delete?" : "Delete draft"}
        </button>
      </div>
    </form>
  );
}

export function GenerateDrafts() {
  const router = useRouter();
  const [r, setR] = useState<InvoiceResult>();
  const [pending, start] = useTransition();
  return (
    <div className="ad-btns" style={{ alignItems: "center" }}>
      <button
        type="button"
        className="ad-btn ghost small"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const res = await generateDrafts();
            setR(res);
            if (res.ok) router.refresh();
          })
        }
      >
        Make month-end drafts now
      </button>
      <Note r={r} pending={pending} />
    </div>
  );
}
