"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  addLineItem,
  adminInvoiceLink,
  createInvoice,
  deleteInvoice,
  deletePackage,
  deleteRule,
  hideSuggestions,
  removeLineItem,
  savePackage,
  saveRate,
  saveRule,
  setInvoiceStatus,
  setOverride,
  setPlan,
  setSuggestions,
  startInvoiceUpload,
  type BillingResult,
  type PackageInput,
} from "@/lib/portal/admin-billing-actions";
import { KINDS, kindLabel, money } from "@/lib/portal/billing";
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

/** New invoice: the client, number, dates, amount, status, and the PDF from Milkywayy Ledger. */
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
            status: String(f.get("status")) as "due" | "paid" | "overdue",
            pdfKey: key,
            note: String(f.get("note") ?? ""),
            notify: f.get("notify") === "on",
          });
          setR(res);
          setProgress("");
          if (res.ok) {
            form.reset();
            setFile(null);
            router.refresh();
          }
        });
      }}
    >
      <h2 className="ad-h2">New invoice</h2>
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
          />
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
      <div className="ad-grid2">
        <div className="ad-field">
          <label htmlFor="inv-status">Status</label>
          <select id="inv-status" name="status" defaultValue="due">
            <option value="due">Due</option>
            <option value="paid">Paid</option>
            <option value="overdue">Overdue</option>
          </select>
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
      </div>
      <div className="ad-field">
        <label htmlFor="inv-note">Note (optional, the client sees it)</label>
        <input id="inv-note" name="note" maxLength={500} />
      </div>
      <label className="ad-check">
        <input type="checkbox" name="notify" defaultChecked />
        Email the client (“New invoice”)
      </label>
      <span className="ad-small ad-muted">
        Due invoices turn Overdue by themselves the day after the due date.
      </span>
      <div className="ad-btns" style={{ alignItems: "center" }}>
        <button type="submit" className="ad-btn" disabled={pending}>
          Add invoice
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
};

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
                if (res.ok) router.refresh();
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

type Line = { key: string; label: string; n: string };

function Lines({
  title,
  amountLabel,
  lines,
  setLines,
}: {
  title: string;
  amountLabel: string;
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
  overage: { key: string; label: string; amount: number }[];
  clients: number;
};

/**
 * A package: private to one client by default (Akash prices individually). "Template" packages
 * (no client) are for suggestions.
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
    (pkg?.overage ?? []).map((x) => ({ key: x.key, label: x.label, n: String(x.amount) })),
  );
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
          currency,
          inclusions: inc
            .filter((l) => l.key)
            .map((l) => ({ key: l.key, label: l.label || kindLabel(l.key), qty: Number(l.n) })),
          overage: over
            .filter((l) => l.key)
            .map((l) => ({
              key: l.key,
              label: l.label || `Extra ${kindLabel(l.key).toLowerCase()}`,
              amount: Number(l.n),
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
            <option value="">Template, no client (for suggestions)</option>
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
          <label htmlFor={`pk-price-${id}`}>Monthly price</label>
          <input
            id={`pk-price-${id}`}
            name="price"
            type="number"
            min={0}
            step="0.01"
            defaultValue={pkg?.monthly_price}
          />
        </div>
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
      </div>
      <Lines title="Included each month" amountLabel="How many" lines={inc} setLines={setInc} />
      <Lines title="Overage rates" amountLabel="Price each" lines={over} setLines={setOver} />
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

export type RuleRow = {
  id: string;
  package_id: string;
  package_name: string;
  monthly_price: number;
  currency: string;
  lookback_months: number;
  threshold_pct: number;
  min_saving: number;
  active: boolean;
};

export function RuleEditor({
  rule,
  packages,
}: {
  rule?: RuleRow;
  packages: { id: string; name: string; price: number; currency: string }[];
}) {
  const router = useRouter();
  const [r, setR] = useState<BillingResult>();
  const [pending, start] = useTransition();
  const id = rule?.id ?? "new";
  return (
    <form
      className="ad-card ad-form"
      aria-label={rule ? `Rule for ${rule.package_name}` : "New rule"}
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        start(async () => {
          const res = await saveRule({
            id: rule?.id,
            package: String(f.get("package") ?? ""),
            lookback: Number(f.get("lookback")),
            threshold: Number(f.get("threshold")),
            minSaving: Number(f.get("min")),
            active: f.get("active") === "on",
          });
          setR(res);
          if (res.ok) router.refresh();
        });
      }}
    >
      <p className="ad-small" style={{ margin: 0 }}>
        Suggest{" "}
        <select
          name="package"
          defaultValue={rule?.package_id ?? ""}
          aria-label={`Package ${id}`}
          style={{ width: "auto" }}
        >
          <option value="">package…</option>
          {packages.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} ({money(p.currency, p.price)})
            </option>
          ))}
        </select>{" "}
        to pay-as-you-go clients whose average spend over the last{" "}
        <input
          name="lookback"
          type="number"
          min={1}
          max={12}
          defaultValue={rule?.lookback_months ?? 3}
          aria-label={`Months ${id}`}
          style={{ width: 64 }}
        />{" "}
        months is at least{" "}
        <input
          name="threshold"
          type="number"
          min={10}
          max={500}
          defaultValue={rule?.threshold_pct ?? 100}
          aria-label={`Percent ${id}`}
          style={{ width: 72 }}
        />
        % of its price, when the saving is above{" "}
        <input
          name="min"
          type="number"
          min={0}
          step="1"
          defaultValue={rule?.min_saving ?? 0}
          aria-label={`Minimum saving ${id}`}
          style={{ width: 96 }}
        />
        .
      </p>
      <div className="ad-btns" style={{ alignItems: "center" }}>
        <label className="ad-check">
          <input type="checkbox" name="active" defaultChecked={rule?.active ?? true} />
          Active
        </label>
        <button type="submit" className="ad-btn small" disabled={pending}>
          {rule ? "Save rule" : "Add rule"}
        </button>
        {rule && (
          <button
            type="button"
            className="ad-btn quiet small"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const res = await deleteRule(rule.id);
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

/* ---------------- the client's page ---------------- */

export type ClientBilling = {
  currency: "AED" | "USD";
  hide_suggestions: boolean;
  plan: {
    mode: "payg" | "package";
    package_id: string | null;
    started_on: string | null;
    renews_on: string | null;
    package: {
      name: string;
      price: number;
      currency: string;
      period_end: string;
      usage: { key: string; label: string; qty: number; used: number }[];
    } | null;
  };
  payg: { total: number; items: unknown[] };
  suggestion: { package: string; saving: number; currency: string } | null;
  rates: {
    key: string;
    label: string;
    unit: string;
    card: number | null;
    override: number | null;
  }[];
  packages: { id: string; name: string; price: number; currency: string; private: boolean }[];
};

export function PlanForm({ account, billing }: { account: string; billing: ClientBilling }) {
  const router = useRouter();
  const [mode, setMode] = useState(billing.plan.mode);
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
            String(f.get("renews") ?? "") || null,
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
          <div className="ad-grid2">
            <div className="ad-field">
              <label htmlFor="plan-start">Started</label>
              <input
                id="plan-start"
                name="started"
                type="date"
                defaultValue={billing.plan.started_on ?? ""}
              />
            </div>
            <div className="ad-field">
              <label htmlFor="plan-renews">Renews on</label>
              <input
                id="plan-renews"
                name="renews"
                type="date"
                defaultValue={billing.plan.renews_on ?? ""}
              />
            </div>
          </div>
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

export function ClientRates({ account, billing }: { account: string; billing: ClientBilling }) {
  const router = useRouter();
  const [r, setR] = useState<BillingResult>();
  const [pending, start] = useTransition();
  return (
    <div className="ad-form" data-testid="client-rates" style={{ overflowX: "auto" }}>
      <table className="ad-table">
        <thead>
          <tr>
            <th>Rate</th>
            <th>Card ({billing.currency})</th>
            <th>This client</th>
          </tr>
        </thead>
        <tbody>
          {billing.rates.map((rate) => (
            <tr key={rate.key}>
              <td>
                {rate.label} <span className="ad-muted">/ {rate.unit}</span>
              </td>
              <td>{rate.card === null ? "—" : money(billing.currency, rate.card)}</td>
              <td>
                <form
                  className="ad-btns"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const v = num(new FormData(e.currentTarget).get("amount"));
                    start(async () => {
                      const res = await setOverride(account, rate.key, v);
                      setR(res);
                      if (res.ok) router.refresh();
                    });
                  }}
                >
                  <input
                    name="amount"
                    type="number"
                    min={0}
                    step="0.01"
                    defaultValue={rate.override ?? ""}
                    placeholder="Card rate"
                    aria-label={`${rate.label} for this client`}
                    style={{ width: 110 }}
                  />
                  <button type="submit" className="ad-btn ghost small" disabled={pending}>
                    Save
                  </button>
                </form>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <Note r={r} pending={pending} />
    </div>
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
