"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  addLineItem,
  adminInvoiceLink,
  createInvoice,
  deleteInvoice,
  decidePayment,
  deletePackage,
  freezeStatements,
  hideSuggestions,
  proofLink,
  removeLineItem,
  saveBillingSettings,
  savePackage,
  saveRate,
  setClientBilling,
  setInvoiceStatus,
  setPlan,
  setSuggestions,
  startInvoiceUpload,
  statementFor,
  type BillingResult,
  type BillingSettings,
  type PackageInput,
  type Statement,
} from "@/lib/portal/admin-billing-actions";
import {
  dateLabel,
  inclusionsText,
  KINDS,
  kindLabel,
  money,
  monthLabel,
  type Offer,
  type PlanView,
} from "@/lib/portal/billing";
import { cx } from "@/lib/cx";
import { uploadFile } from "@/lib/upload-browser";

/** Admin → Billing (CLIENT_PORTAL_GUIDE §7.3): the client-side pieces. */

function Note({
  r,
  pending,
  busy = "Saving…",
}: {
  r?: BillingResult;
  pending?: boolean;
  busy?: string;
}) {
  return (
    <span className={cx("ad-status", r && !r.ok && "error")} role="status">
      {pending ? busy : (r?.notice ?? r?.error)}
    </span>
  );
}

const num = (v: FormDataEntryValue | null) => {
  const s = String(v ?? "").trim();
  return s === "" ? null : Number(s);
};

type Client = { id: string; name: string; currency: "AED" | "USD" };

/* ---------------- invoices ---------------- */

/**
 * A one-off invoice from a Milkywayy Ledger PDF: the client, number, dates, amount and the PDF.
 * It becomes a draft in the queue (owner, 10 Oct 2026): nothing is sent until it's approved.
 */
export function NewInvoiceForm({
  clients,
  account: initial,
}: {
  clients: Client[];
  account?: string;
}) {
  const router = useRouter();
  const [account, setAccount] = useState(initial ?? "");
  const client = clients.find((c) => c.id === account);
  const [currency, setCurrency] = useState<"AED" | "USD">(client?.currency ?? "AED");
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState("");
  const [r, setR] = useState<BillingResult>();
  const [pending, start] = useTransition();
  const today = new Date().toISOString().slice(0, 10);
  // The month this invoice bills: last month by default. Its frozen statement prefills the amount.
  const months = Array.from({ length: 6 }, (_, i) => {
    const d = new Date();
    d.setUTCDate(1);
    d.setUTCMonth(d.getUTCMonth() - 1 - i);
    return d.toISOString().slice(0, 8) + "01";
  });
  const [month, setMonth] = useState(months[0]);
  const [amount, setAmount] = useState("");
  const [statement, setStatement] = useState<Statement | null | "loading">(null);
  const lookUp = (acc: string, m: string) => {
    if (!acc || !m) return setStatement(null);
    setStatement("loading");
    void statementFor(acc, m).then((st) => {
      setStatement(st);
      if (st) {
        setAmount(String(Number(st.total)));
        setCurrency(st.currency);
      }
    });
  };
  const st = statement === "loading" ? null : statement;
  const differs = !!st && amount !== "" && Math.abs(Number(amount) - Number(st.total)) > 0.005;

  return (
    <form
      className="ad-card ad-form"
      aria-label="New invoice"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        const form = e.currentTarget;
        start(async () => {
          if (!account) return setR({ ok: false, error: "Choose the client." });
          if (!file) return setR({ ok: false, error: "Choose the invoice PDF." });
          let key: string | null = null;
          setProgress("Uploading…");
          const ok = await uploadFile(
            file,
            `invoice-${account}`,
            {
              start: async () => {
                const p = await startInvoiceUpload(account, file.name, file.size);
                if (p.ok) key = p.key;
                return p;
              },
              resume: async () => ({ ok: false, error: "Start again." }),
              finish: async () => ({ ok: true }),
            },
            (p) => p.state && setProgress(p.state),
          );
          if (!ok || !key)
            return setR({ ok: false, error: progress || "The upload didn’t finish." });
          const res = await createInvoice({
            account,
            number: String(f.get("number") ?? ""),
            issued: String(f.get("issued") ?? ""),
            due: String(f.get("due") ?? ""),
            amount: Number(f.get("amount")),
            currency,
            status: "due",
            pdfKey: key,
            note: String(f.get("note") ?? ""),
            notify: false,
            statementMonth: month || null,
          });
          setR(res);
          setProgress("");
          if (res.ok) {
            form.reset();
            setFile(null);
            setAmount("");
            setStatement(null);
            router.refresh();
          }
        });
      }}
    >
      <h2 className="ad-h2">New invoice from a Ledger PDF</h2>
      <span className="ad-small ad-muted">
        Becomes a draft in the queue. Approve it there to publish and email it.
      </span>
      <div className="ad-grid2">
        <div className="ad-field">
          <label htmlFor="inv-client">Client</label>
          <select
            id="inv-client"
            value={account}
            onChange={(e) => {
              setAccount(e.target.value);
              const c = clients.find((x) => x.id === e.target.value);
              if (c) setCurrency(c.currency);
              lookUp(e.target.value, month);
            }}
          >
            <option value="">Choose a client…</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div className="ad-field">
          <label htmlFor="inv-number">Invoice number (from Ledger)</label>
          <input id="inv-number" name="number" maxLength={40} placeholder="INV-2026-031" />
        </div>
      </div>
      <div className="ad-field">
        <label htmlFor="inv-month">For the month</label>
        <select
          id="inv-month"
          value={month}
          onChange={(e) => {
            setMonth(e.target.value);
            lookUp(account, e.target.value);
          }}
        >
          {months.map((m) => (
            <option key={m} value={m}>
              {monthLabel(m)}
            </option>
          ))}
          <option value="">Not a monthly invoice</option>
        </select>
        <span className="ad-small ad-muted" data-testid="statement-note">
          {statement === "loading"
            ? "Looking up the statement…"
            : st
              ? `Statement for ${monthLabel(st.month)}: ${money(st.currency, Number(st.total))}${Number(st.vat) ? ` (incl. VAT ${money(st.currency, Number(st.vat))})` : ""}. Amount filled in from it.`
              : account && month
                ? "No frozen statement for that month."
                : ""}
        </span>
      </div>
      <div className="ad-grid2">
        <div className="ad-field">
          <label htmlFor="inv-issued">Invoice date</label>
          <input id="inv-issued" name="issued" type="date" defaultValue={today} />
        </div>
        <div className="ad-field">
          <label htmlFor="inv-due">Due date</label>
          <input id="inv-due" name="due" type="date" />
        </div>
      </div>
      <div className="ad-grid2">
        <div className="ad-field">
          <label htmlFor="inv-amount">Amount</label>
          <input
            id="inv-amount"
            name="amount"
            type="number"
            min={0}
            step="0.01"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            aria-describedby="inv-amount-warn"
          />
          {differs && st && (
            <span id="inv-amount-warn" className="ad-status error" role="alert">
              Differs from the statement ({money(st.currency, Number(st.total))}). Check before
              sending.
            </span>
          )}
        </div>
        <div className="ad-field">
          <label htmlFor="inv-currency">Currency</label>
          <select
            id="inv-currency"
            value={currency}
            onChange={(e) => setCurrency(e.target.value as "AED" | "USD")}
          >
            <option>AED</option>
            <option>USD</option>
          </select>
        </div>
      </div>
      <div className="ad-field">
        <label htmlFor="inv-pdf">PDF</label>
        <input
          id="inv-pdf"
          type="file"
          accept="application/pdf,.pdf"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
      </div>
      <div className="ad-field">
        <label htmlFor="inv-note">Note (optional, the client sees it)</label>
        <input id="inv-note" name="note" maxLength={500} />
      </div>
      <div className="ad-btns" style={{ alignItems: "center" }}>
        <button type="submit" className="ad-btn" disabled={pending}>
          Add as a draft
        </button>
        <Note r={r} pending={pending} busy={progress || "Saving…"} />
      </div>
    </form>
  );
}

export type InvoiceRowData = {
  id: string;
  number: string;
  account_name: string;
  issued_on: string;
  due_on: string;
  amount: number;
  currency: string;
  status: "due" | "paid" | "overdue";
  shown_status: "due" | "paid" | "overdue";
  pdf_key: string | null;
  payment_state: "submitted" | "rejected" | null;
  reject_reason: string | null;
  paid_via: "stripe" | "bank" | "manual" | null;
  statement_month: string | null;
  proof: {
    id: string;
    filename: string;
    note: string | null;
    status: "submitted" | "confirmed" | "rejected";
    submitted_at: string;
    reason: string | null;
  } | null;
};

/** A bank-transfer proof waiting for Milkywayy: view it, confirm (Paid), or reject with a reason. */
export function PaymentReview({ inv }: { inv: InvoiceRowData }) {
  const router = useRouter();
  const [r, setR] = useState<BillingResult>();
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, start] = useTransition();
  const p = inv.proof;
  if (!p || p.status !== "submitted" || inv.status === "paid") return null;
  return (
    <div className="ad-note" data-testid="payment-review" style={{ margin: 0 }}>
      <b>Payment submitted</b> · {p.filename}
      {p.note ? ` · “${p.note}”` : ""}
      <div className="ad-btns" style={{ alignItems: "center", marginTop: 8 }}>
        <button
          type="button"
          className="ad-btn ghost small"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const res = await proofLink(p.id);
              if (res.ok && res.url) window.open(res.url, "_blank", "noopener");
              else setR(res);
            })
          }
        >
          View proof
        </button>
        <button
          type="button"
          className="ad-btn small"
          aria-label={`Confirm payment for ${inv.number}`}
          disabled={pending}
          onClick={() =>
            start(async () => {
              const res = await decidePayment(p.id, true);
              setR(res);
              if (res.ok) router.refresh();
            })
          }
        >
          Confirm payment
        </button>
        {rejecting ? (
          <form
            className="ad-btns"
            onSubmit={(e) => {
              e.preventDefault();
              start(async () => {
                const res = await decidePayment(p.id, false, reason);
                setR(res);
                if (res.ok) router.refresh();
              });
            }}
          >
            <input
              aria-label={`Why reject the payment for ${inv.number}`}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Reason (the client sees it)"
              maxLength={300}
            />
            <button type="submit" className="ad-btn quiet small" disabled={pending}>
              Reject
            </button>
          </form>
        ) : (
          <button
            type="button"
            className="ad-btn quiet small"
            disabled={pending}
            onClick={() => setRejecting(true)}
          >
            Reject…
          </button>
        )}
        <Note r={r} pending={pending} />
      </div>
    </div>
  );
}

export function InvoiceActions({ inv }: { inv: InvoiceRowData }) {
  const router = useRouter();
  const [r, setR] = useState<BillingResult>();
  const [sure, setSure] = useState(false);
  const [pending, start] = useTransition();
  return (
    <div className="ad-btns" style={{ alignItems: "center" }}>
      <select
        aria-label={`Status of ${inv.number}`}
        value={inv.shown_status}
        disabled={pending}
        onChange={(e) =>
          start(async () => {
            const res = await setInvoiceStatus(inv.id, e.target.value as InvoiceRowData["status"]);
            setR(res);
            if (res.ok) router.refresh();
          })
        }
        style={{ width: "auto" }}
      >
        <option value="due">Due</option>
        <option value="paid">Paid</option>
        <option value="overdue">Overdue</option>
      </select>
      {inv.pdf_key && (
        <button
          type="button"
          className="ad-btn ghost small"
          aria-label={`PDF of ${inv.number}`}
          disabled={pending}
          onClick={() =>
            start(async () => {
              const res = await adminInvoiceLink(inv.id);
              if (res.ok && res.url) window.open(res.url, "_blank", "noopener");
              else setR(res);
            })
          }
        >
          PDF
        </button>
      )}
      <button
        type="button"
        className="ad-btn quiet small"
        disabled={pending}
        onClick={() =>
          sure
            ? start(async () => {
                const res = await deleteInvoice(inv.id);
                setR(res);
                // The invoice page is gone with it: back to the queue.
                if (res.ok) router.push("/admin/billing");
              })
            : setSure(true)
        }
      >
        {sure ? "Really delete?" : "Delete"}
      </button>
      <Note r={r} pending={pending} />
    </div>
  );
}

/* ---------------- rate card ---------------- */

export type RateRow = {
  key: string;
  label: string;
  unit: string;
  amount_aed: number | null;
  amount_usd: number | null;
  sort: number;
};

export function RateCardRow({ row }: { row?: RateRow }) {
  const router = useRouter();
  const [r, setR] = useState<BillingResult>();
  const [pending, start] = useTransition();
  const id = row?.key ?? "new";
  return (
    <form
      className="ad-rate"
      aria-label={row ? `Rate ${row.label}` : "New rate"}
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        start(async () => {
          const res = await saveRate({
            key: String(f.get("key") ?? row?.key ?? "").trim(),
            label: String(f.get("label") ?? ""),
            unit: String(f.get("unit") ?? ""),
            aed: num(f.get("aed")),
            usd: num(f.get("usd")),
            sort: Number(f.get("sort") ?? row?.sort ?? 100),
          });
          setR(res);
          if (res.ok) router.refresh();
        });
      }}
    >
      {row ? (
        <span className="ad-mono">{row.key}</span>
      ) : (
        <input name="key" aria-label="Key" placeholder="key_like_this" />
      )}
      <input
        name="label"
        aria-label={`Label ${id}`}
        defaultValue={row?.label}
        placeholder="Label"
      />
      <input name="unit" aria-label={`Unit ${id}`} defaultValue={row?.unit} placeholder="per…" />
      <input
        name="aed"
        aria-label={`AED ${id}`}
        type="number"
        min={0}
        step="0.01"
        defaultValue={row?.amount_aed ?? ""}
        placeholder="AED"
      />
      <input
        name="usd"
        aria-label={`USD ${id}`}
        type="number"
        min={0}
        step="0.01"
        defaultValue={row?.amount_usd ?? ""}
        placeholder="USD"
      />
      <input type="hidden" name="sort" value={row?.sort ?? 100} />
      <button type="submit" className="ad-btn small" disabled={pending}>
        {row ? "Save" : "Add"}
      </button>
      <Note r={r} pending={pending} />
    </form>
  );
}

/* ---------------- packages ---------------- */

type Line = { key: string; label: string; n: string; n2?: string };

function Lines({
  title,
  amountLabel,
  secondLabel,
  lines,
  setLines,
}: {
  title: string;
  amountLabel: string;
  /** A second amount per line (templates: the USD overage rate). */
  secondLabel?: string;
  lines: Line[];
  setLines: (l: Line[]) => void;
}) {
  return (
    <fieldset className="ad-fieldset">
      <legend>{title}</legend>
      {lines.map((l, i) => (
        <div key={i} className="ad-line">
          <select
            aria-label={`${title} ${i + 1}: kind`}
            value={l.key}
            onChange={(e) =>
              setLines(
                lines.map((x, j) =>
                  j === i
                    ? { ...x, key: e.target.value, label: x.label || kindLabel(e.target.value) }
                    : x,
                ),
              )
            }
          >
            <option value="">Kind…</option>
            {KINDS.map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </select>
          <input
            aria-label={`${title} ${i + 1}: label`}
            value={l.label}
            placeholder="Label the client sees"
            onChange={(e) =>
              setLines(lines.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))
            }
          />
          <input
            aria-label={`${title} ${i + 1}: ${amountLabel}`}
            type="number"
            min={0}
            step="any"
            value={l.n}
            placeholder={amountLabel}
            onChange={(e) =>
              setLines(lines.map((x, j) => (j === i ? { ...x, n: e.target.value } : x)))
            }
          />
          {secondLabel && (
            <input
              aria-label={`${title} ${i + 1}: ${secondLabel}`}
              type="number"
              min={0}
              step="any"
              value={l.n2 ?? ""}
              placeholder={secondLabel}
              onChange={(e) =>
                setLines(lines.map((x, j) => (j === i ? { ...x, n2: e.target.value } : x)))
              }
            />
          )}
          <button
            type="button"
            className="ad-btn quiet small"
            onClick={() => setLines(lines.filter((_, j) => j !== i))}
          >
            Remove
          </button>
        </div>
      ))}
      <button
        type="button"
        className="ad-btn ghost small"
        onClick={() => setLines([...lines, { key: "", label: "", n: "" }])}
      >
        + Add
      </button>
    </fieldset>
  );
}

export type PackageRow = {
  id: string;
  account_id: string | null;
  account_name: string | null;
  name: string;
  monthly_price: number;
  currency: "AED" | "USD";
  inclusions: { key: string; label: string; qty: number }[];
  overage: { key: string; label: string; amount: number; amount_usd?: number | null }[];
  clients: number;
  price_usd: number | null;
  six_month_discount_pct: number;
  suggest: boolean;
};

/**
 * A package: private to one client by default (Akash prices individually). Templates (no client)
 * are internal, priced in AED and USD, and are what suggestions are made from (owner, 4 Oct 2026).
 */
export function PackageEditor({
  pkg,
  clients,
  account,
  onDone,
}: {
  pkg?: PackageRow;
  clients: Client[];
  account?: string;
  onDone?: () => void;
}) {
  const router = useRouter();
  const [owner, setOwner] = useState(pkg ? (pkg.account_id ?? "") : (account ?? ""));
  const [currency, setCurrency] = useState<"AED" | "USD">(
    pkg?.currency ?? clients.find((c) => c.id === owner)?.currency ?? "AED",
  );
  const [inc, setInc] = useState<Line[]>(
    (pkg?.inclusions ?? [{ key: "reel", label: "Reels", qty: 10 }]).map((x) => ({
      key: x.key,
      label: x.label,
      n: String(x.qty),
    })),
  );
  const [over, setOver] = useState<Line[]>(
    (pkg?.overage ?? []).map((x) => ({
      key: x.key,
      label: x.label,
      n: String(x.amount),
      n2: x.amount_usd == null ? "" : String(x.amount_usd),
    })),
  );
  const template = !owner;
  const [r, setR] = useState<BillingResult>();
  const [pending, start] = useTransition();
  const id = pkg?.id ?? "new";

  return (
    <form
      className="ad-card ad-form"
      aria-label={pkg ? `Package ${pkg.name}` : "New package"}
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        const input: PackageInput = {
          id: pkg?.id,
          account: owner || null,
          name: String(f.get("name") ?? ""),
          price: Number(f.get("price")),
          currency: template ? "AED" : currency,
          priceUsd: template ? num(f.get("price_usd")) : null,
          discountPct: Number(f.get("discount") ?? 10),
          suggest: template ? f.get("suggest") === "on" : true,
          inclusions: inc
            .filter((l) => l.key)
            .map((l) => ({ key: l.key, label: l.label || kindLabel(l.key), qty: Number(l.n) })),
          overage: over
            .filter((l) => l.key)
            .map((l) => ({
              key: l.key,
              label: l.label || `Extra ${kindLabel(l.key).toLowerCase()}`,
              amount: Number(l.n),
              ...(template && l.n2 ? { amount_usd: Number(l.n2) } : {}),
            })),
        };
        start(async () => {
          const res = await savePackage(input);
          setR(res);
          if (res.ok) {
            router.refresh();
            onDone?.();
          }
        });
      }}
    >
      <div className="ad-grid2">
        <div className="ad-field">
          <label htmlFor={`pk-name-${id}`}>Package name</label>
          <input
            id={`pk-name-${id}`}
            name="name"
            defaultValue={pkg?.name}
            maxLength={60}
            placeholder="Growth"
          />
        </div>
        <div className="ad-field">
          <label htmlFor={`pk-client-${id}`}>Client (private package)</label>
          <select
            id={`pk-client-${id}`}
            value={owner}
            onChange={(e) => {
              setOwner(e.target.value);
              const c = clients.find((x) => x.id === e.target.value);
              if (c) setCurrency(c.currency);
            }}
          >
            <option value="">Template, no client (internal, for suggestions)</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="ad-grid2">
        <div className="ad-field">
          <label htmlFor={`pk-price-${id}`}>
            {template ? "Monthly price (AED)" : "Monthly price"}
          </label>
          <input
            id={`pk-price-${id}`}
            name="price"
            type="number"
            min={0}
            step="0.01"
            defaultValue={pkg?.monthly_price}
          />
        </div>
        {template ? (
          <div className="ad-field">
            <label htmlFor={`pk-usd-${id}`}>Monthly price (USD)</label>
            <input
              id={`pk-usd-${id}`}
              name="price_usd"
              type="number"
              min={0}
              step="0.01"
              defaultValue={pkg?.price_usd ?? ""}
            />
          </div>
        ) : (
          <div className="ad-field">
            <label htmlFor={`pk-cur-${id}`}>Currency</label>
            <select
              id={`pk-cur-${id}`}
              value={currency}
              onChange={(e) => setCurrency(e.target.value as "AED" | "USD")}
            >
              <option>AED</option>
              <option>USD</option>
            </select>
          </div>
        )}
      </div>
      <div className="ad-grid2">
        <div className="ad-field">
          <label htmlFor={`pk-disc-${id}`}>6-month commitment discount (%)</label>
          <input
            id={`pk-disc-${id}`}
            name="discount"
            type="number"
            min={0}
            max={50}
            step="0.5"
            defaultValue={pkg?.six_month_discount_pct ?? 10}
          />
        </div>
        {template && (
          <label className="ad-check" style={{ alignSelf: "end" }}>
            <input type="checkbox" name="suggest" defaultChecked={pkg?.suggest ?? true} />
            Use for suggestions
          </label>
        )}
      </div>
      <Lines title="Included each month" amountLabel="How many" lines={inc} setLines={setInc} />
      <Lines
        title="Overage rates"
        amountLabel={template ? "AED each" : "Price each"}
        secondLabel={template ? "USD each" : undefined}
        lines={over}
        setLines={setOver}
      />
      <span className="ad-small ad-muted">
        Work beyond the inclusions is charged at these rates; kinds without one use the client’s own
        rate.
      </span>
      <div className="ad-btns" style={{ alignItems: "center" }}>
        <button type="submit" className="ad-btn" disabled={pending}>
          {pkg ? "Save package" : "Create package"}
        </button>
        {pkg && pkg.clients === 0 && (
          <button
            type="button"
            className="ad-btn quiet small"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const res = await deletePackage(pkg.id);
                setR(res);
                if (res.ok) router.refresh();
              })
            }
          >
            Delete
          </button>
        )}
        <Note r={r} pending={pending} />
      </div>
    </form>
  );
}

/* ---------------- suggestions ---------------- */

export function SuggestionsSwitch({ enabled }: { enabled: boolean }) {
  const router = useRouter();
  const [r, setR] = useState<BillingResult>();
  const [pending, start] = useTransition();
  return (
    <div className="ad-btns" style={{ alignItems: "center" }}>
      <label className="ad-check">
        <input
          type="checkbox"
          checked={enabled}
          disabled={pending}
          onChange={(e) =>
            start(async () => {
              const res = await setSuggestions(e.target.checked);
              setR(res);
              if (res.ok) router.refresh();
            })
          }
        />
        Show package suggestions to pay-as-you-go clients
      </label>
      <Note r={r} pending={pending} />
    </div>
  );
}

/** The minimum monthly saving before a client sees a suggestion, per currency. */
export function SuggestionMinimums({ aed, usd }: { aed: number; usd: number }) {
  const router = useRouter();
  const [r, setR] = useState<BillingResult>();
  const [pending, start] = useTransition();
  return (
    <form
      className="ad-form"
      aria-label="Minimum saving"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        start(async () => {
          const res = await saveBillingSettings({
            min_saving_aed: Number(f.get("aed")),
            min_saving_usd: Number(f.get("usd")),
          });
          setR(res);
          if (res.ok) router.refresh();
        });
      }}
    >
      <div className="ad-grid2">
        <div className="ad-field">
          <label htmlFor="min-aed">Minimum saving a month (AED)</label>
          <input id="min-aed" name="aed" type="number" min={0} step="1" defaultValue={aed} />
        </div>
        <div className="ad-field">
          <label htmlFor="min-usd">Minimum saving a month (USD)</label>
          <input id="min-usd" name="usd" type="number" min={0} step="1" defaultValue={usd} />
        </div>
      </div>
      <div className="ad-btns" style={{ alignItems: "center" }}>
        <button type="submit" className="ad-btn small" disabled={pending}>
          Save minimums
        </button>
        <Note r={r} pending={pending} />
      </div>
    </form>
  );
}

/** Admin → Billing → Settings: VAT and the bank details AED clients pay into. */
export function BillingSettingsForm({ s }: { s: BillingSettings }) {
  const router = useRouter();
  const [r, setR] = useState<BillingResult>();
  const [pending, start] = useTransition();
  return (
    <form
      className="ad-card ad-form"
      aria-label="Billing settings"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        start(async () => {
          const res = await saveBillingSettings({
            vat_registered: f.get("vat") === "on",
            bank_account_name: String(f.get("account_name") ?? ""),
            bank_name: String(f.get("bank") ?? ""),
            bank_iban: String(f.get("iban") ?? ""),
            bank_swift: String(f.get("swift") ?? ""),
            invoice_prefix: String(f.get("prefix") ?? ""),
            next_invoice_no: Number(f.get("next_no")),
            default_due_days: Number(f.get("due_days")),
            company_name: String(f.get("company_name") ?? ""),
            company_address: String(f.get("company_address") ?? ""),
            company_trn: String(f.get("company_trn") ?? ""),
            company_email: String(f.get("company_email") ?? ""),
          });
          setR(res);
          if (res.ok) router.refresh();
        });
      }}
    >
      <h2 className="ad-h2">VAT</h2>
      <label className="ad-check">
        <input type="checkbox" name="vat" defaultChecked={s.vat_registered} />
        VAT registered: add 5% VAT to statements and invoice drafts (“Tax invoice” on the PDF)
      </label>
      <h2 className="ad-h2">Invoices</h2>
      <span className="ad-small ad-muted">
        Numbers are given when you approve a draft. The PDF shows these company details.
      </span>
      <div className="ad-grid3">
        <div className="ad-field">
          <label htmlFor="in-prefix">Number prefix</label>
          <input
            id="in-prefix"
            name="prefix"
            maxLength={12}
            defaultValue={s.invoice_prefix ?? "MW-"}
          />
        </div>
        <div className="ad-field">
          <label htmlFor="in-next">Next number</label>
          <input
            id="in-next"
            name="next_no"
            type="number"
            min={1}
            defaultValue={s.next_invoice_no ?? 1001}
          />
        </div>
        <div className="ad-field">
          <label htmlFor="in-due">Due after (days)</label>
          <input
            id="in-due"
            name="due_days"
            type="number"
            min={0}
            max={90}
            defaultValue={s.default_due_days ?? 7}
          />
        </div>
      </div>
      <div className="ad-grid2">
        <div className="ad-field">
          <label htmlFor="co-name">Company name</label>
          <input
            id="co-name"
            name="company_name"
            maxLength={120}
            defaultValue={s.company_name ?? ""}
            placeholder="Milkywayy LLC"
          />
        </div>
        <div className="ad-field">
          <label htmlFor="co-email">Billing email</label>
          <input
            id="co-email"
            name="company_email"
            maxLength={160}
            defaultValue={s.company_email ?? ""}
          />
        </div>
      </div>
      <div className="ad-grid2">
        <div className="ad-field">
          <label htmlFor="co-address">Company address</label>
          <input
            id="co-address"
            name="company_address"
            maxLength={300}
            defaultValue={s.company_address ?? ""}
          />
        </div>
        <div className="ad-field">
          <label htmlFor="co-trn">TRN (shown when VAT registered)</label>
          <input
            id="co-trn"
            name="company_trn"
            maxLength={15}
            inputMode="numeric"
            defaultValue={s.company_trn ?? ""}
          />
        </div>
      </div>
      <h2 className="ad-h2">Bank transfer details</h2>
      <span className="ad-small ad-muted">
        Shown to clients who pay by bank transfer (AED accounts by default), Owner and Admins only.
      </span>
      <div className="ad-grid2">
        <div className="ad-field">
          <label htmlFor="bk-name">Account name</label>
          <input
            id="bk-name"
            name="account_name"
            maxLength={120}
            defaultValue={s.bank_account_name ?? ""}
          />
        </div>
        <div className="ad-field">
          <label htmlFor="bk-bank">Bank</label>
          <input id="bk-bank" name="bank" maxLength={120} defaultValue={s.bank_name ?? ""} />
        </div>
      </div>
      <div className="ad-grid2">
        <div className="ad-field">
          <label htmlFor="bk-iban">IBAN</label>
          <input id="bk-iban" name="iban" maxLength={42} defaultValue={s.bank_iban ?? ""} />
        </div>
        <div className="ad-field">
          <label htmlFor="bk-swift">SWIFT</label>
          <input id="bk-swift" name="swift" maxLength={11} defaultValue={s.bank_swift ?? ""} />
        </div>
      </div>
      <div className="ad-btns" style={{ alignItems: "center" }}>
        <button type="submit" className="ad-btn" disabled={pending}>
          Save settings
        </button>
        <Note r={r} pending={pending} />
      </div>
    </form>
  );
}

/* ---------------- the client's page ---------------- */

export type ClientBilling = {
  currency: "AED" | "USD";
  hide_suggestions: boolean;
  pinned_package_id: string | null;
  pay_online: boolean | null;
  pays_online: boolean;
  plan: {
    mode: "payg" | "package";
    package_id: string | null;
    started_on: string | null;
    renews_on: string | null;
    term_months: 1 | 6;
    ends_on: string | null;
    package: PlanView | null;
  };
  payg: {
    total: number;
    items: unknown[];
    last_month: { month: string; total: number; final: boolean } | null;
  };
  suggestion: Offer | null;
  best_offer: Offer | null;
  rates: {
    key: string;
    label: string;
    unit: string;
    card: number | null;
    override: number | null;
  }[];
  packages: {
    id: string;
    name: string;
    price: number;
    currency: string;
    private: boolean;
    discount_pct: number;
  }[];
  statements: (Statement & { id: string })[];
};

export function PlanForm({ account, billing }: { account: string; billing: ClientBilling }) {
  const router = useRouter();
  const [mode, setMode] = useState(billing.plan.mode);
  const [term, setTerm] = useState<1 | 6>(billing.plan.term_months ?? 1);
  const [r, setR] = useState<BillingResult>();
  const [pending, start] = useTransition();
  return (
    <form
      className="ad-form"
      aria-label="Plan"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        start(async () => {
          const res = await setPlan(
            account,
            mode,
            mode === "package" ? String(f.get("package") ?? "") || null : null,
            String(f.get("started") ?? "") || null,
            null,
            term,
            String(f.get("ends") ?? "") || null,
          );
          setR(res);
          if (res.ok) router.refresh();
        });
      }}
    >
      <div className="ad-btns" role="group" aria-label="Plan type">
        {(
          [
            ["payg", "Pay as you go"],
            ["package", "Monthly package"],
          ] as const
        ).map(([m, l]) => (
          <button
            key={m}
            type="button"
            className={cx("ad-btn small", mode !== m && "ghost")}
            aria-pressed={mode === m}
            onClick={() => setMode(m)}
          >
            {l}
          </button>
        ))}
      </div>
      {mode === "package" && (
        <>
          <div className="ad-field">
            <label htmlFor="plan-package">Package</label>
            <select id="plan-package" name="package" defaultValue={billing.plan.package_id ?? ""}>
              <option value="">Choose…</option>
              {billing.packages.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} · {money(p.currency, p.price)}/month{p.private ? "" : " (template)"}
                </option>
              ))}
            </select>
          </div>
          <div className="ad-field">
            <label htmlFor="plan-term">Term</label>
            <select
              id="plan-term"
              value={term}
              onChange={(e) => setTerm(Number(e.target.value) as 1 | 6)}
            >
              <option value={1}>Monthly</option>
              <option value={6}>6-month contract (package’s discount applies)</option>
            </select>
          </div>
          <div className="ad-field">
            <label htmlFor="plan-start">Starts on</label>
            <input
              id="plan-start"
              name="started"
              type="date"
              defaultValue={billing.plan.started_on ?? ""}
            />
            <span className="ad-small ad-muted">
              Packages run by calendar month and renew on the 1st. Starting mid-month pro-rates the
              first month (price and inclusions by days).
            </span>
          </div>
          {term === 6 && (
            <div className="ad-field">
              <label htmlFor="plan-ends">
                Contract ends (blank: 6 full months after a pro-rated first month)
              </label>
              <input
                id="plan-ends"
                name="ends"
                type="date"
                defaultValue={billing.plan.ends_on ?? ""}
              />
            </div>
          )}
        </>
      )}
      <div className="ad-btns" style={{ alignItems: "center" }}>
        <button type="submit" className="ad-btn small" disabled={pending}>
          Save plan
        </button>
        <Note r={r} pending={pending} />
      </div>
    </form>
  );
}

export function HideSuggestions({ account, hidden }: { account: string; hidden: boolean }) {
  const router = useRouter();
  const [r, setR] = useState<BillingResult>();
  const [pending, start] = useTransition();
  return (
    <div className="ad-btns" style={{ alignItems: "center" }}>
      <label className="ad-check">
        <input
          type="checkbox"
          checked={hidden}
          disabled={pending}
          onChange={(e) =>
            start(async () => {
              const res = await hideSuggestions(account, e.target.checked);
              setR(res);
              if (res.ok) router.refresh();
            })
          }
        />
        Never show this client a package suggestion
      </label>
      <Note r={r} pending={pending} />
    </div>
  );
}

/** Per client: pin a custom offer (replaces the templates in their suggestion); card or bank. */
export function ClientOffer({ account, billing }: { account: string; billing: ClientBilling }) {
  const router = useRouter();
  const [r, setR] = useState<BillingResult>();
  const [pending, start] = useTransition();
  const save = (p: Parameters<typeof setClientBilling>[1]) =>
    start(async () => {
      const res = await setClientBilling(account, p);
      setR(res);
      if (res.ok) router.refresh();
    });
  return (
    <div className="ad-form" style={{ gap: 10 }}>
      <div className="ad-grid2">
        <div className="ad-field">
          <label htmlFor="pin-offer">Pinned offer (instead of the templates)</label>
          <select
            id="pin-offer"
            value={billing.pinned_package_id ?? ""}
            disabled={pending}
            onChange={(e) => save({ pinned_package_id: e.target.value || null })}
          >
            <option value="">None: suggest from templates</option>
            {billing.packages.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} · {money(p.currency, p.price)}/month{p.private ? "" : " (template)"}
              </option>
            ))}
          </select>
        </div>
        <div className="ad-field">
          <label htmlFor="pay-online">How they pay</label>
          <select
            id="pay-online"
            value={billing.pay_online == null ? "" : String(billing.pay_online)}
            disabled={pending}
            onChange={(e) =>
              save({ pay_online: e.target.value === "" ? null : e.target.value === "true" })
            }
          >
            <option value="">
              Automatic ({billing.currency === "AED" ? "bank transfer for AED" : "card for USD"})
            </option>
            <option value="true">Card (Stripe “Pay now”)</option>
            <option value="false">Bank transfer</option>
          </select>
        </div>
      </div>
      <Note r={r} pending={pending} />
    </div>
  );
}

/** What the engine would suggest, and why the client does or doesn't see it. */
export function OfferPreview({ billing }: { billing: ClientBilling }) {
  const o = billing.best_offer;
  if (!o) {
    if (billing.plan.mode === "package") return null;
    return (
      <p className="ad-small ad-muted" style={{ margin: 0 }} data-testid="offer-preview">
        No suggestion: needs work in at least 2 of the last 3 complete months.
      </p>
    );
  }
  const why = billing.hide_suggestions
    ? "Hidden for this client (“never show”)."
    : o.pinned
      ? "Pinned: the client always sees it."
      : billing.suggestion
        ? "The client sees this."
        : "Not shown: suggestions are off, or the saving is under the minimum.";
  return (
    <div className="ad-note" style={{ margin: 0 }} data-testid="offer-preview">
      <b>
        {o.pinned ? "Pinned offer" : "Best offer"}: {o.package}
      </b>{" "}
      · {inclusionsText(o.inclusions)}
      <div className="ad-small">
        {money(o.currency, o.price)}/month; 6 months {money(o.currency, o.price_6)}/month.{" "}
        {o.saving != null && o.average != null
          ? `Average ${money(o.currency, o.average)}/month · with the package ${money(o.currency, o.cost ?? 0)} (overage ${money(o.currency, o.overage ?? 0)} + not covered ${money(o.currency, o.uncovered ?? 0)}) · saving ${money(o.currency, o.saving)}/month${o.show_saving ? "" : " (none: shown as “Your offer”)"}. `
          : "No saving worked out (on a package, or not enough history): shown as “Your offer”. "}
        {why}
      </div>
    </div>
  );
}

/** Frozen month-end statements; freeze last month now (it also happens on the 1st by itself). */
export function Statements({ account, billing }: { account: string; billing: ClientBilling }) {
  const router = useRouter();
  const [r, setR] = useState<BillingResult>();
  const [pending, start] = useTransition();
  const d = new Date();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() - 1);
  const last = d.toISOString().slice(0, 8) + "01";
  const frozen = billing.statements.some((s) => s.month === last);
  return (
    <div className="ad-form" data-testid="statements" style={{ gap: 8 }}>
      {billing.statements.length ? (
        <ul className="ad-list" style={{ margin: 0, padding: 0, listStyle: "none" }}>
          {billing.statements.map((s) => (
            <li key={s.month} className="ad-row" style={{ justifyContent: "space-between" }}>
              <span>
                {monthLabel(s.month)} · {s.mode === "package" ? "package" : "pay as you go"}
                <span className="ad-small ad-muted"> · frozen {dateLabel(s.frozen_at)}</span>
              </span>
              <b>
                {money(s.currency, Number(s.total))}
                {Number(s.vat) ? (
                  <span className="ad-small ad-muted">
                    {" "}
                    incl. VAT {money(s.currency, Number(s.vat))}
                  </span>
                ) : null}
              </b>
            </li>
          ))}
        </ul>
      ) : (
        <p className="ad-small ad-muted" style={{ margin: 0 }}>
          No statements yet. They freeze on the 1st for every client with work or a package.
        </p>
      )}
      <div className="ad-btns" style={{ alignItems: "center" }}>
        <button
          type="button"
          className="ad-btn ghost small"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const res = await freezeStatements(account, last, frozen);
              setR(res);
              if (res.ok) router.refresh();
            })
          }
        >
          {frozen ? `Re-freeze ${monthLabel(last)}` : `Freeze ${monthLabel(last)} now`}
        </button>
        <Note r={r} pending={pending} />
      </div>
    </div>
  );
}

/* ---------------- line items on a project ---------------- */

export type LineItemRow = {
  id: string;
  description: string;
  qty: number;
  unit_price: number;
  currency: string;
  kind: string | null;
  delivered_month: string | null;
};

export function LineItems({ project, items }: { project: string; items: LineItemRow[] }) {
  const router = useRouter();
  const [r, setR] = useState<BillingResult>();
  const [pending, start] = useTransition();
  const total = items.reduce((t, i) => t + Number(i.qty) * Number(i.unit_price), 0);
  return (
    <section className="ad-card ad-form" aria-label="Line items" data-testid="line-items">
      <h2 className="ad-h2">Line items</h2>
      <span className="ad-small ad-muted">
        What this project bills. Delivered items count towards the client’s month (“this month so
        far”) and their plan’s usage.
      </span>
      {items.length > 0 && (
        <div style={{ overflowX: "auto" }}>
          <table className="ad-table">
            <thead>
              <tr>
                <th>Item</th>
                <th>Kind</th>
                <th>Qty</th>
                <th>Each</th>
                <th>Month</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {items.map((i) => (
                <tr key={i.id}>
                  <td>{i.description}</td>
                  <td>{kindLabel(i.kind)}</td>
                  <td>{Number(i.qty)}</td>
                  <td>{money(i.currency, i.unit_price)}</td>
                  <td>{i.delivered_month ? i.delivered_month.slice(0, 7) : "not delivered"}</td>
                  <td>
                    <button
                      type="button"
                      className="ad-btn quiet small"
                      disabled={pending}
                      onClick={() =>
                        start(async () => {
                          const res = await removeLineItem(project, i.id);
                          setR(res);
                          if (res.ok) router.refresh();
                        })
                      }
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
              <tr>
                <td colSpan={3}>
                  <b>Total</b>
                </td>
                <td colSpan={3}>
                  <b>{money(items[0].currency, total)}</b>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
      <form
        className="ad-line"
        aria-label="Add a line item"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          const form = e.currentTarget;
          start(async () => {
            const res = await addLineItem(
              project,
              String(f.get("kind")),
              String(f.get("description") ?? ""),
              Number(f.get("qty")),
              num(f.get("price")),
            );
            setR(res);
            if (res.ok) {
              form.reset();
              router.refresh();
            }
          });
        }}
      >
        <select name="kind" aria-label="Kind" defaultValue="reel">
          {KINDS.map(([k, l]) => (
            <option key={k} value={k}>
              {l}
            </option>
          ))}
        </select>
        <input
          name="description"
          aria-label="Description (optional)"
          placeholder="Description (optional)"
        />
        <input name="qty" type="number" min={0} step="any" defaultValue={1} aria-label="Quantity" />
        <input
          name="price"
          type="number"
          min={0}
          step="0.01"
          aria-label="Price each (blank = client's rate)"
          placeholder="Client's rate"
        />
        <button type="submit" className="ad-btn small" disabled={pending}>
          Add
        </button>
      </form>
      <Note r={r} pending={pending} />
    </section>
  );
}
