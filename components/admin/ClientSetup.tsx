"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { PropertyPricing } from "@/content/types";
import { dateLabel, money } from "@/lib/portal/billing";
import { setClientRate } from "@/lib/portal/budget-actions";
import { useSaveSlot } from "./SaveGroup";
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

export type PriceHistory = {
  key: string;
  amount: number | null;
  effective_from: string;
  created_by: string | null;
};

const GROUPS = [
  ["property", "Photos · by property size"],
  ["production", "Videos"],
  ["post", "Editing"],
  ["avatars", "AI avatars"],
] as const;

/** Retired rows: hidden, never dropped; anything already logged keeps its price. The shoot-only
 *  property (17 Oct 2026), and videography by size, the old shoot day and avatar video items
 *  (booking redesign, 18 Oct 2026: videos are one price per video). The database hides them too
 *  (rate_card.grp null); this keeps them off if an environment hasn't migrated yet. */
const RETIRED = new Set(["prop_raw", "prop_short", "prop_long", "shoot_day", "avatar_video"]);
/** A price group whose service is off collapses to one muted line (stored prices stay). */
const GROUP_SERVICE: Partial<
  Record<(typeof GROUPS)[number][0], keyof ClientSetupData["services"]>
> = { post: "post", avatars: "avatars" };

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
  if (["prop_tour", "prop_twilight"].includes(key)) return { text: "Website list (by size)" };
  return null;
}

export function PriceList({
  account,
  data,
  pricing,
  history = [],
}: {
  account: string;
  data: ClientSetupData;
  pricing: PropertyPricing;
  /** Dated prices (`client_rates`), newest first: shown per row (rate history merged in). */
  history?: PriceHistory[];
}) {
  // Rows for property sizes the price list doesn't have are left out.
  const rows = data.prices.filter(
    (p) =>
      !RETIRED.has(p.key) && (!/^prop_photo_/.test(p.key) || siteDefault(p.key, pricing) !== null),
  );
  const vals0 = Object.fromEntries(
    rows.map((p) => [p.key, p.client == null ? "" : String(Number(p.client))]),
  );
  const [vals, setVals] = useState<Record<string, string>>(vals0);
  const today = dubaiToday();
  const [from, setFrom] = useState(today);
  const changed = rows.filter((p) => vals[p.key].trim() !== vals0[p.key]);
  // From today: the whole list, as before (saveClientPrices). From a later date: each changed price
  // as a dated rate (setClientRate, what Rate history did).
  useSaveSlot(`prices-${account}`, "Prices", 40, changed.length > 0, async () => {
    if (from <= today)
      return saveClientPrices(
        account,
        rows.map((p) => ({
          key: p.key,
          amount: vals[p.key].trim() === "" ? null : Number(vals[p.key]),
        })),
      );
    if (changed.some((p) => vals[p.key].trim() === ""))
      return { ok: false, error: "Going back to the default can only apply from today." };
    for (const p of changed) {
      const res = await setClientRate(account, p.key, Number(vals[p.key]), from);
      if (!res.ok) return res;
    }
    return { ok: true };
  });
  const past = (k: string) => history.filter((h) => h.key === k);
  // This client's own prices only, unless "Show all" (AUDIT item 8). Saved prices decide what
  // shows, so a row doesn't vanish while you type; hidden rows are saved unchanged.
  const own = rows.filter((p) => p.client != null).length;
  const [all, setAll] = useState(own === 0);
  const shown = (p: (typeof rows)[number]) => all || p.client != null;
  return (
    <section className="ad-card ad-form" aria-label="Client price list" data-testid="client-prices">
      <div className="ad-row-between">
        <h2 className="ad-h2" style={{ margin: 0 }}>
          Client price list · {data.currency}
        </h2>
        <label className="ad-check ad-small">
          <input
            type="checkbox"
            checked={all}
            data-testid="prices-show-all"
            onChange={(e) => setAll(e.target.checked)}
          />
          <span>Show all ({rows.length})</span>
        </label>
      </div>
      {!all && (
        <span className="ad-small" data-testid="prices-own-count">
          {own} custom price{own === 1 ? "" : "s"}. Everything else is the default.
        </span>
      )}
      <span className="ad-help">
        Affects every line item for this client. Blank = the default. Property photo defaults come
        from Prices &amp; packages → Website prices.
      </span>
      <div className="ad-scroll">
        <table className="ad-table" aria-label="Client price list">
          <thead>
            <tr>
              <th>Service</th>
              <th>Includes</th>
              <th>Default</th>
              <th>This client’s price</th>
              <th>History</th>
            </tr>
          </thead>
          {GROUPS.map(([g, title]) => {
            const list = rows.filter((p) => p.grp === g && shown(p));
            if (!list.length && !all) return null;
            const svc = GROUP_SERVICE[g];
            if (svc && !data.services[svc])
              return (
                <tbody key={g} data-testid={`prices-off-${g}`}>
                  <tr>
                    <th colSpan={5}>
                      {title}
                      <span className="ad-small ad-muted" style={{ fontWeight: 400 }}>
                        {" "}
                        · Not enabled for this client
                      </span>
                    </th>
                  </tr>
                </tbody>
              );
            if (!list.length) return null;
            return (
              <tbody key={g}>
                <tr>
                  <th colSpan={5}>{title}</th>
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
                      <td className="ad-small">
                        {past(p.key).length ? (
                          <details data-testid="rate-history">
                            <summary>{past(p.key).length}</summary>
                            <ul className="ad-history">
                              {past(p.key).map((h) => (
                                <li key={h.effective_from}>
                                  {h.amount == null
                                    ? "default"
                                    : money(data.currency, Number(h.amount))}{" "}
                                  from {dateLabel(h.effective_from)}
                                  <span className="ad-muted">
                                    {h.created_by ? ` · ${h.created_by}` : ""}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          </details>
                        ) : (
                          <span className="ad-muted">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            );
          })}
        </table>
      </div>
      <div className="ad-field" style={{ maxWidth: 260 }}>
        <label htmlFor={`prices-from-${account}`}>Changed prices apply from</label>
        <input
          id={`prices-from-${account}`}
          type="date"
          min={today}
          value={from}
          onChange={(e) => setFrom(e.target.value || today)}
        />
        <span className="ad-help">Work already logged keeps its price.</span>
      </div>
    </section>
  );
}

/* ---------------- plan ---------------- */

type Inc = { key: string; label: string; qty: string };

const nextMonth = () => {
  const d = new Date(Date.now() + 4 * 3600_000);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)).toISOString().slice(0, 10);
};

/** Today in Dubai (YYYY-MM-DD): "Start now" pro-rates this month from today. */
const dubaiToday = () => new Date(Date.now() + 4 * 3600_000).toISOString().slice(0, 10);

export type PackageValue = {
  allowance: number | null;
  half_day_cap: number | null;
  /** Templates' allowance and cap, by template id. */
  templates: Record<string, { allowance: number | null; half_day_cap: number | null }>;
};

export function PlanBlock({
  account,
  data,
  showBudgetSet,
  value,
}: {
  account: string;
  data: ClientSetupData;
  /** The "Show budget" switch as set (kept when switching to pay as you go). */
  showBudgetSet: boolean | null;
  /** The value model (owner, 24 Oct 2026): monthly allowance + half-day cap. */
  value?: PackageValue;
}) {
  const p = data.plan;
  const init = {
    mode: (p.mode === "package" ? "package" : "payg") as "payg" | "package",
    name: p.name ?? "",
    amount: p.amount != null ? String(Number(p.amount)) : "",
    term: (p.term ?? 1) as 1 | 6,
    started: p.started_on ?? nextMonth(),
    ends: p.ends_on ?? "",
    advance: p.advance,
    payg: data.payg_invoicing,
    allowance: value?.allowance != null ? String(Number(value.allowance)) : "",
    // Shoot days in full days (owner, 24 Oct 2026); stored as half-days.
    cap: value?.half_day_cap != null ? String(Number(value.half_day_cap) / 2) : "",
  };
  const [mode, setMode] = useState(init.mode);
  const [template, setTemplate] = useState("");
  const [name, setName] = useState(init.name);
  const [amount, setAmount] = useState(init.amount);
  const [term, setTerm] = useState<1 | 6>(init.term);
  const [started, setStarted] = useState(init.started);
  const [ends, setEnds] = useState(init.ends);
  const [advance, setAdvance] = useState(init.advance);
  const [inc, setInc] = useState<Inc[]>(
    p.inclusions.map((i) => ({ key: i.key, label: i.label, qty: String(Number(i.qty)) })),
  );
  const [payg, setPaygInv] = useState(init.payg);
  const [allowance, setAllowance] = useState(init.allowance);
  const [cap, setCap] = useState(init.cap);
  const now = { mode, name, amount, term, started, ends, advance, payg, allowance, cap };
  const dirty =
    !!template ||
    (Object.keys(init) as (keyof typeof init)[]).some((k) =>
      mode === "payg"
        ? k === "mode" || k === "payg"
          ? now[k] !== init[k]
          : false
        : k !== "payg" && now[k] !== init[k],
    );
  // What an inclusion can count: a whole property shoot, or any listed service but property parts.
  const options = [
    { key: "shoot", label: "Property shoot (shot & edited)" },
    ...data.prices
      .filter((x) => x.grp !== "property" && !RETIRED.has(x.key))
      .map((x) => ({ key: x.key, label: x.label })),
  ];
  const labelOf = (k: string) => options.find((o) => o.key === k)?.label ?? k;
  const fromTemplate = (id: string) => {
    setTemplate(id);
    const t = data.templates.find((x) => x.id === id);
    if (!t) return;
    setName(t.name);
    setAmount(String(Number(t.price)));
    const tv = value?.templates[id];
    setAllowance(String(Number(tv?.allowance ?? t.price)));
    setCap(tv?.half_day_cap != null ? String(Number(tv.half_day_cap) / 2) : "");
    setInc(
      t.inclusions
        .filter((i) => options.some((o) => o.key === i.key))
        .map((i) => ({ key: i.key, label: labelOf(i.key), qty: String(Number(i.qty)) })),
    );
  };

  useSaveSlot(`plan-${account}`, "Plan", 20, dirty, () =>
    mode === "payg"
      ? setPayg(account, payg, showBudgetSet)
      : saveClientPackage(account, {
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
          allowance: allowance.trim() === "" ? null : Number(allowance),
          half_day_cap: cap.trim() === "" ? null : Math.round(Number(cap) * 2),
        }),
  );

  return (
    <section className="ad-card ad-form" aria-label="Plan" data-testid="client-plan">
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
            Affects when pay-as-you-go invoices are drafted: one per delivery or one a month. Drafts
            still need your approval.
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
              {started > dubaiToday() && (
                <button
                  type="button"
                  className="ad-btn small"
                  style={{ marginTop: 6 }}
                  data-testid="plan-start-now"
                  onClick={() => setStarted(dubaiToday())}
                >
                  Start now (pro-rated)
                </button>
              )}
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
              <label htmlFor="plan-billing">Package invoice</label>
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

          <div className="ad-grid2" data-testid="package-value">
            <div className="ad-field">
              <label htmlFor="plan-allowance">Monthly allowance ({data.currency})</label>
              <input
                id="plan-allowance"
                inputMode="decimal"
                value={allowance}
                placeholder={amount || "10000"}
                onChange={(e) => setAllowance(e.target.value)}
              />
              <span className="ad-help">
                Value of work included each month at this client’s prices.
              </span>
            </div>
            <div className="ad-field">
              <label htmlFor="plan-cap">Shoot days (full days)</label>
              <input
                id="plan-cap"
                type="number"
                min={0}
                step={0.5}
                value={cap}
                placeholder="4"
                onChange={(e) => setCap(e.target.value)}
              />
              <span className="ad-help">Content-shoot time per month. A half day is 0.5.</span>
            </div>
          </div>
          <span className="ad-small ad-muted">
            Content shoots: fixed quantity = quantity × price; by the day = the larger of that and
            the half/full-day rate. Property shoots count their price, not shoot days. Used up when
            either the allowance or the shoot days run out; the rest is an extra on the month-end
            invoice.
          </span>
          {inc.length > 0 && (
            <details>
              <summary className="ad-small ad-muted">
                Old inclusions ({inc.length}), kept for reference
              </summary>
              <ul className="ad-small">
                {inc.map((i, n) => (
                  <li key={n}>
                    {Number(i.qty)} × {labelOf(i.key)}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}
    </section>
  );
}
