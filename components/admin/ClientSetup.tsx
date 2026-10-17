"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { PropertyPricing } from "@/content/types";
import { money } from "@/lib/portal/billing";
import {
  saveClientPackage,
  saveClientPrices,
  setPayg,
  setServices,
  type SetupResult,
} from "@/lib/portal/client-setup-actions";
import { cx } from "@/lib/cx";

/**
 * The client page's top blocks (owner, 17 Oct 2026): Services enabled, the client's price list
 * (always, whatever the plan) and their plan (pay as you go, or their own monthly package).
 */
export type ClientSetupData = {
  currency: "AED" | "USD";
  services: { production: boolean; post: boolean; avatars: boolean };
  payg_invoicing: "per_project" | "month_end";
  prices: {
    key: string;
    label: string;
    unit: string;
    grp: "property" | "production" | "post" | "avatars";
    includes: string | null;
    default: number | null;
    client: number | null;
  }[];
  plan: {
    mode: "payg" | "package" | "budget";
    package_id: string | null;
    own: boolean | null;
    name: string | null;
    amount: number | null;
    inclusions: { key: string; label: string; qty: number }[];
    term: 1 | 6;
    started_on: string | null;
    ends_on: string | null;
    advance: boolean;
  };
  templates: {
    id: string;
    name: string;
    price: number;
    inclusions: { key: string; label: string; qty: number }[];
  }[];
};

function Note({ r, pending }: { r?: SetupResult; pending?: boolean }) {
  return (
    <span className={cx("ad-status", r && !r.ok && "error", r?.ok && "ok")} role="status">
      {pending ? "Saving…" : (r?.notice ?? r?.error)}
    </span>
  );
}

/* ---------------- services ---------------- */

const SERVICES = [
  ["production", "Production (shoots)", "Shoots, listings and contacts"],
  ["post", "Post-production (editing)", "They send files, we edit"],
  ["avatars", "AI avatars", "AI characters and avatar videos"],
] as const;

export function ServicesBlock({ account, s }: { account: string; s: ClientSetupData["services"] }) {
  const router = useRouter();
  const [on, setOn] = useState(s);
  const [r, setR] = useState<SetupResult>();
  const [pending, start] = useTransition();
  return (
    <section
      className="ad-card ad-form"
      aria-label="Services enabled"
      data-testid="client-services"
    >
      <h2 className="ad-h2">Services enabled</h2>
      <span className="ad-small ad-muted">
        The client sees and can book only what’s on. AI avatars have their own tab, never in Book
        media.
      </span>
      <div className="ad-grid3">
        {SERVICES.map(([k, label, hint]) => (
          <label key={k} className="ad-check">
            <input
              type="checkbox"
              checked={on[k]}
              disabled={pending}
              onChange={(e) => {
                const next = { ...on, [k]: e.target.checked };
                setOn(next);
                start(async () => {
                  const res = await setServices(account, next);
                  setR(res);
                  if (res.ok) router.refresh();
                  else setOn(on);
                });
              }}
            />
            <span>
              <b>{label}</b>
              <span className="ad-small ad-muted" style={{ display: "block" }}>
                {hint}
              </span>
            </span>
          </label>
        ))}
      </div>
      <Note r={r} pending={pending} />
    </section>
  );
}

/* ---------------- price list ---------------- */

const GROUPS = [
  ["property", "Property shoot · shot & edited"],
  ["production", "Shoots"],
  ["post", "Editing"],
  ["avatars", "AI avatars"],
] as const;

/** The website price list's value for a property part ("by size" for flat parts). */
function siteDefault(
  key: string,
  pricing: PropertyPricing,
): { label?: string; text: string } | null {
  const m = /^prop_photo_(apt|villa)_(\d)$/.exec(key);
  if (m) {
    const t = m[1] === "apt" ? pricing.apartment : pricing.villa;
    const z = t.sizes[Number(m[2])];
    return z ? { label: `Photos · ${t.label} ${z.label}`, text: `AED ${z.photo}` } : null;
  }
  if (["prop_short", "prop_long", "prop_tour", "prop_twilight"].includes(key))
    return { text: "Website list (by size)" };
  return null;
}

export function PriceList({
  account,
  data,
  pricing,
}: {
  account: string;
  data: ClientSetupData;
  pricing: PropertyPricing;
}) {
  const router = useRouter();
  // Rows for property sizes the price list doesn't have are left out.
  const rows = data.prices.filter(
    (p) => !/^prop_photo_/.test(p.key) || siteDefault(p.key, pricing) !== null,
  );
  const [vals, setVals] = useState<Record<string, string>>(
    Object.fromEntries(rows.map((p) => [p.key, p.client == null ? "" : String(Number(p.client))])),
  );
  const [r, setR] = useState<SetupResult>();
  const [pending, start] = useTransition();
  return (
    <form
      className="ad-card ad-form"
      aria-label="Client price list"
      data-testid="client-prices"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const res = await saveClientPrices(
            account,
            rows.map((p) => ({
              key: p.key,
              amount: vals[p.key].trim() === "" ? null : Number(vals[p.key]),
            })),
          );
          setR(res);
          if (res.ok) router.refresh();
        });
      }}
    >
      <h2 className="ad-h2">Client price list · {data.currency}</h2>
      <span className="ad-small ad-muted">
        Blank uses the default. A changed price applies to work logged from today; anything already
        logged keeps its price. Shown on bookings to those who see prices.
      </span>
      <div className="ad-scroll">
        <table className="ad-table" aria-label="Client price list">
          <thead>
            <tr>
              <th>Service</th>
              <th>Includes</th>
              <th>Default</th>
              <th>This client’s price</th>
            </tr>
          </thead>
          {GROUPS.map(([g, title]) => {
            const list = rows.filter((p) => p.grp === g);
            if (!list.length) return null;
            return (
              <tbody key={g}>
                <tr>
                  <th colSpan={4}>{title}</th>
                </tr>
                {list.map((p) => {
                  const site = siteDefault(p.key, pricing);
                  const label = site?.label ?? p.label;
                  return (
                    <tr key={p.key}>
                      <td>
                        {label}
                        <span className="ad-small ad-muted"> · per {p.unit}</span>
                      </td>
                      <td className="ad-small">{p.includes}</td>
                      <td className="ad-small">
                        {p.default != null
                          ? money(data.currency, Number(p.default))
                          : (site?.text ?? "Not set")}
                      </td>
                      <td>
                        <input
                          aria-label={`${label}: this client's price`}
                          inputMode="decimal"
                          placeholder="Default"
                          value={vals[p.key]}
                          style={{ width: 110 }}
                          onChange={(e) => setVals((v) => ({ ...v, [p.key]: e.target.value }))}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            );
          })}
        </table>
      </div>
      <div className="ad-btns" style={{ alignItems: "center" }}>
        <button type="submit" className="ad-btn small" disabled={pending}>
          Save prices
        </button>
        <Note r={r} pending={pending} />
      </div>
    </form>
  );
}

/* ---------------- plan ---------------- */

type Inc = { key: string; label: string; qty: string };

const nextMonth = () => {
  const d = new Date(Date.now() + 4 * 3600_000);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)).toISOString().slice(0, 10);
};

export function PlanBlock({
  account,
  data,
  showBudgetSet,
}: {
  account: string;
  data: ClientSetupData;
  /** The "Show budget" switch as set (kept when switching to pay as you go). */
  showBudgetSet: boolean | null;
}) {
  const router = useRouter();
  const p = data.plan;
  const [mode, setMode] = useState<"payg" | "package">(p.mode === "package" ? "package" : "payg");
  const [template, setTemplate] = useState("");
  const [name, setName] = useState(p.name ?? "");
  const [amount, setAmount] = useState(p.amount != null ? String(Number(p.amount)) : "");
  const [term, setTerm] = useState<1 | 6>(p.term ?? 1);
  const [started, setStarted] = useState(p.started_on ?? nextMonth());
  const [ends, setEnds] = useState(p.ends_on ?? "");
  const [advance, setAdvance] = useState(p.advance);
  const [inc, setInc] = useState<Inc[]>(
    p.inclusions.map((i) => ({ key: i.key, label: i.label, qty: String(Number(i.qty)) })),
  );
  const [payg, setPaygInv] = useState(data.payg_invoicing);
  const [r, setR] = useState<SetupResult>();
  const [pending, start] = useTransition();

  // What an inclusion can count: a whole property shoot, or any listed service but property parts.
  const options = [
    { key: "shoot", label: "Property shoot (shot & edited)" },
    ...data.prices.filter((x) => x.grp !== "property").map((x) => ({ key: x.key, label: x.label })),
  ];
  const labelOf = (k: string) => options.find((o) => o.key === k)?.label ?? k;
  const fromTemplate = (id: string) => {
    setTemplate(id);
    const t = data.templates.find((x) => x.id === id);
    if (!t) return;
    setName(t.name);
    setAmount(String(Number(t.price)));
    setInc(
      t.inclusions
        .filter((i) => options.some((o) => o.key === i.key))
        .map((i) => ({ key: i.key, label: labelOf(i.key), qty: String(Number(i.qty)) })),
    );
  };

  return (
    <form
      className="ad-card ad-form"
      aria-label="Plan"
      data-testid="client-plan"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const res =
            mode === "payg"
              ? await setPayg(account, payg, showBudgetSet)
              : await saveClientPackage(account, {
                  template_id: template || null,
                  name: name.trim(),
                  amount: amount.trim() === "" ? NaN : Number(amount),
                  term,
                  started,
                  ends: term === 6 ? ends || null : null,
                  advance,
                  inclusions: inc
                    .filter((i) => i.key)
                    .map((i) => ({ key: i.key, label: labelOf(i.key), qty: Number(i.qty) })),
                });
          setR(res);
          if (res.ok) router.refresh();
        });
      }}
    >
      <h2 className="ad-h2">Plan</h2>
      {p.mode === "budget" && (
        <p className="ad-note" style={{ margin: 0 }}>
          This client is on a budget package (below). Saving a plan here replaces it.
        </p>
      )}
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

      {mode === "payg" ? (
        <div className="ad-field">
          <label htmlFor="plan-payg">Invoice timing</label>
          <select
            id="plan-payg"
            value={payg}
            onChange={(e) => setPaygInv(e.target.value as "per_project" | "month_end")}
          >
            <option value="month_end">One at month end</option>
            <option value="per_project">One per delivery</option>
          </select>
          <span className="ad-help">
            Every item at this client’s prices. Drafts still need your approval.
          </span>
        </div>
      ) : (
        <>
          {data.templates.length > 0 && (
            <div className="ad-field">
              <label htmlFor="plan-template">Start from template (optional)</label>
              <select
                id="plan-template"
                value={template}
                onChange={(e) => fromTemplate(e.target.value)}
              >
                <option value="">—</option>
                {data.templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} · {money(data.currency, Number(t.price))}/month
                  </option>
                ))}
              </select>
              <span className="ad-help">
                Fills the fields below. Changes here are this client’s only; the template stays as
                it is.
              </span>
            </div>
          )}
          <div className="ad-grid2">
            <div className="ad-field">
              <label htmlFor="plan-name">Package name</label>
              <input
                id="plan-name"
                value={name}
                maxLength={60}
                placeholder="Monthly package"
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="ad-field">
              <label htmlFor="plan-amount">Monthly amount ({data.currency})</label>
              <input
                id="plan-amount"
                inputMode="decimal"
                value={amount}
                placeholder="10000"
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <div className="ad-field">
              <label htmlFor="plan-term">Term</label>
              <select
                id="plan-term"
                value={term}
                onChange={(e) => setTerm(Number(e.target.value) as 1 | 6)}
              >
                <option value={1}>Monthly</option>
                <option value={6}>6-month contract</option>
              </select>
            </div>
            <div className="ad-field">
              <label htmlFor="plan-start">Starts on</label>
              <input
                id="plan-start"
                type="date"
                value={started}
                onChange={(e) => setStarted(e.target.value)}
              />
            </div>
            {term === 6 && (
              <div className="ad-field">
                <label htmlFor="plan-ends">Contract ends (blank: 6 full months)</label>
                <input
                  id="plan-ends"
                  type="date"
                  value={ends}
                  onChange={(e) => setEnds(e.target.value)}
                />
              </div>
            )}
            <div className="ad-field">
              <label htmlFor="plan-billing">Billing</label>
              <select
                id="plan-billing"
                value={advance ? "advance" : "month_end"}
                onChange={(e) => setAdvance(e.target.value === "advance")}
              >
                <option value="month_end">At month end: package + extras</option>
                <option value="advance">In advance: package on the 1st, extras at month end</option>
              </select>
            </div>
          </div>
          <span className="ad-small ad-muted">
            Packages run by calendar month and renew on the 1st. Starting mid-month pro-rates the
            first month (price and inclusions by days).
          </span>

          <div className="ad-scroll">
            <table className="ad-table" aria-label="Inclusions per month">
              <thead>
                <tr>
                  <th>Included each month</th>
                  <th>Quantity</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {inc.map((i, n) => (
                  <tr key={n} data-testid="inclusion">
                    <td>
                      <select
                        aria-label={`Inclusion ${n + 1}: service`}
                        value={i.key}
                        onChange={(e) =>
                          setInc((l) =>
                            l.map((x, j) =>
                              j === n
                                ? { ...x, key: e.target.value, label: labelOf(e.target.value) }
                                : x,
                            ),
                          )
                        }
                      >
                        <option value="">Choose…</option>
                        {options.map((o) => (
                          <option
                            key={o.key}
                            value={o.key}
                            disabled={inc.some((x, j) => j !== n && x.key === o.key)}
                          >
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <input
                        aria-label={`Inclusion ${n + 1}: quantity per month`}
                        type="number"
                        min={1}
                        step={1}
                        value={i.qty}
                        style={{ width: 90 }}
                        onChange={(e) =>
                          setInc((l) =>
                            l.map((x, j) => (j === n ? { ...x, qty: e.target.value } : x)),
                          )
                        }
                      />
                    </td>
                    <td>
                      <button
                        type="button"
                        className="ad-btn ghost small"
                        onClick={() => setInc((l) => l.filter((_, j) => j !== n))}
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="ad-btns">
            <button
              type="button"
              className="ad-btn ghost small"
              onClick={() => setInc((l) => [...l, { key: "", label: "", qty: "1" }])}
            >
              Add inclusion
            </button>
          </div>
          <span className="ad-small ad-muted">
            Each logged item is Included while this month has that service left, then an Extra at
            this client’s price. Month-end invoice: package + extras.
          </span>
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
