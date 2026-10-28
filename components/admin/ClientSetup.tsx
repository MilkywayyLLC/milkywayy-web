"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import type { PropertyPricing } from "@/content/types";
import { dateLabel, money } from "@/lib/portal/billing";
import { setClientRate } from "@/lib/portal/budget-actions";
import { useSaveSlot } from "./SaveGroup";
import {
  saveClientPackage,
  saveClientPrices,
  setPayg,
  setServices,
  switchPreview,
  type SwitchPreview,
} from "@/lib/portal/client-setup-actions";
import { cx } from "@/lib/cx";
import { Confirm } from "./Confirm";

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
    /** Package invoice mode (28 Oct 2026). */
    billing?: "usage" | "upfront";
    minimum?: number | null;
    upfront_from?: string | null;
  };
  templates: {
    id: string;
    name: string;
    price: number;
    inclusions: { key: string; label: string; qty: number }[];
  }[];
};

/* ---------------- services ---------------- */

const SERVICES = [
  ["production", "Production (shoots)", "Shoots, listings and contacts"],
  ["post", "Post-production (editing)", "They send files, we edit"],
  ["avatars", "AI avatars", "AI characters and avatar videos"],
] as const;

export function ServicesBlock({ account, s }: { account: string; s: ClientSetupData["services"] }) {
  const [on, setOn] = useState(s);
  const dirty = (Object.keys(s) as (keyof typeof s)[]).some((k) => on[k] !== s[k]);
  useSaveSlot(`svc-${account}`, "Services", 10, dirty, () => setServices(account, on));
  return (
    <section
      className="ad-card ad-form"
      aria-label="Services enabled"
      data-testid="client-services"
    >
      <h2 className="ad-h2">Services enabled</h2>
      <span className="ad-help">
        Affects what the client sees and can book. AI avatars have their own tab, never in Book
        media.
      </span>
      <div className="ad-grid3">
        {SERVICES.map(([k, label, hint]) => (
          <label key={k} className="ad-check">
            <input
              type="checkbox"
              checked={on[k]}
              onChange={(e) => setOn({ ...on, [k]: e.target.checked })}
            />
            <span>
              <b>{label}</b>
              <span className="ad-help ad-block">{hint}</span>
            </span>
          </label>
        ))}
      </div>
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
        <h2 className="ad-h2 ad-m0">Client price list · {data.currency}</h2>
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

/**
 * The plan type picked on the client page right now (unsaved too), for blocks that depend on it:
 * How they pay hides Payment terms on a package.
 */
const PlanMode = createContext<{ mode: "payg" | "package"; set: (m: "payg" | "package") => void }>({
  mode: "payg",
  set: () => {},
});
export const usePlanMode = () => useContext(PlanMode).mode;

export function PlanModeProvider({
  initial,
  children,
}: {
  initial: "payg" | "package" | "budget";
  children: ReactNode;
}) {
  const [mode, set] = useState<"payg" | "package">(initial === "package" ? "package" : "payg");
  return <PlanMode.Provider value={{ mode, set }}>{children}</PlanMode.Provider>;
}

const nextMonth = () => {
  const d = new Date(Date.now() + 4 * 3600_000);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)).toISOString().slice(0, 10);
};

/** Today in Dubai (YYYY-MM-DD). */
const dubaiToday = () => new Date(Date.now() + 4 * 3600_000).toISOString().slice(0, 10);

export type PackageValue = {
  allowance: number | null;
  half_day_cap: number | null;
  /** Templates' allowance and cap, by template id. */
  templates: Record<string, { allowance: number | null; half_day_cap: number | null }>;
};

/** What a switch from pay as you go moves (portal_admin_switch_preview), in a few lines. */
function SwitchSummary({ s, currency }: { s: SwitchPreview; currency: string }) {
  const m = (n: number) => money(currency, Number(n));
  const voided = s.voids.reduce((t, v) => t + Number(v.amount), 0);
  return (
    <ul className="ad-small ad-stack-4" data-testid="switch-summary">
      <li>
        {s.projects.length
          ? `${s.projects.length} booking${s.projects.length === 1 ? "" : "s"} this month (${m(s.usage_total)}) count toward the package: ${s.projects.map((p) => p.ref).join(", ")}.`
          : "Nothing booked this month yet."}
      </li>
      {s.credits.filter((c) => c.paid).length > 0 && (
        <li>
          Paid at booking, credited on the month-end invoice:{" "}
          {s.credits
            .filter((c) => c.paid)
            .map((c) => `${c.number ?? "invoice"} (${m(c.amount)})`)
            .join(", ")}
          .
        </li>
      )}
      {s.voids.length > 0 && (
        <li>
          Voided and moved onto the package’s month-end invoice:{" "}
          {s.voids.map((v) => `${v.number ?? "draft"} · ${v.ref}`).join(", ")} ({m(voided)}).
        </li>
      )}
      {s.payg_drafts.length > 0 && <li>This month’s pay-as-you-go draft is voided.</li>}
    </ul>
  );
}

export function PlanBlock({
  account,
  data,
  showBudgetSet,
  value,
  rollover,
}: {
  account: string;
  data: ClientSetupData;
  /** The "Show budget" switch as set (kept when switching to pay as you go). */
  showBudgetSet: boolean | null;
  /** The value model (owner, 24 Oct 2026): monthly allowance + half-day cap. */
  value?: PackageValue;
  /** The client's rollover settings: shown inside the plan when it's billed upfront. */
  rollover?: ReactNode;
}) {
  const p = data.plan;
  const pm = useContext(PlanMode);
  const init = {
    mode: (p.mode === "package" ? "package" : "payg") as "payg" | "package",
    name: p.name ?? "",
    amount: p.amount != null ? String(Number(p.amount)) : "",
    term: (p.term ?? 1) as 1 | 6,
    started: p.started_on ?? nextMonth(),
    ends: p.ends_on ?? "",
    billing: (p.billing ?? "usage") as "usage" | "upfront",
    minimum: p.minimum != null ? String(Number(p.minimum)) : "",
    payg: data.payg_invoicing,
    allowance: value?.allowance != null ? String(Number(value.allowance)) : "",
    // Shoot days in full days (owner, 24 Oct 2026); stored as half-days.
    cap: value?.half_day_cap != null ? String(Number(value.half_day_cap) / 2) : "",
  };
  const [mode, setModeLocal] = useState(init.mode);
  const setMode = (m: "payg" | "package") => {
    setModeLocal(m);
    pm.set(m);
  };
  const [template, setTemplate] = useState("");
  const [name, setName] = useState(init.name);
  const [amount, setAmount] = useState(init.amount);
  const [term, setTerm] = useState<1 | 6>(init.term);
  const [started, setStarted] = useState(init.started);
  const [ends, setEnds] = useState(init.ends);
  const [billing, setBilling] = useState(init.billing);
  const [minimum, setMinimum] = useState(init.minimum);
  const [payg, setPaygInv] = useState(init.payg);
  const [allowance, setAllowance] = useState(init.allowance);
  const [cap, setCap] = useState(init.cap);
  // The switch summary, waiting for the admin's OK (resolves the save).
  const [ask, setAsk] = useState<{ s: SwitchPreview; done: (ok: boolean) => void } | null>(null);
  const now = { mode, name, amount, term, started, ends, billing, minimum, payg, allowance, cap };
  const dirty =
    !!template ||
    (Object.keys(init) as (keyof typeof init)[]).some((k) =>
      mode === "payg"
        ? k === "mode" || k === "payg"
          ? now[k] !== init[k]
          : false
        : k !== "payg" && now[k] !== init[k],
    );
  const fromTemplate = (id: string) => {
    setTemplate(id);
    const t = data.templates.find((x) => x.id === id);
    if (!t) return;
    setName(t.name);
    setAmount(String(Number(t.price)));
    const tv = value?.templates[id];
    setAllowance(String(Number(tv?.allowance ?? t.price)));
    setCap(tv?.half_day_cap != null ? String(Number(tv.half_day_cap) / 2) : "");
  };

  useSaveSlot(`plan-${account}`, "Plan", 5, dirty, async () => {
    if (mode === "payg") return setPayg(account, payg, showBudgetSet);
    // From pay as you go: show what moves onto the package before saving.
    if (p.mode !== "package" && started <= dubaiToday()) {
      const s = await switchPreview(account, started);
      if (s && (s.projects.length || s.voids.length || s.payg_drafts.length)) {
        const ok = await new Promise<boolean>((done) => setAsk({ s, done }));
        setAsk(null);
        if (!ok) return { ok: false, error: "Not saved." };
      }
    }
    return saveClientPackage(account, {
      template_id: template || null,
      name: name.trim(),
      amount: amount.trim() === "" ? NaN : Number(amount),
      term,
      started,
      ends: term === 6 ? ends || null : null,
      billing,
      minimum: billing === "usage" && minimum.trim() !== "" ? Number(minimum) : null,
      // Old inclusions aren't edited any more; whatever is stored stays as it is.
      inclusions: p.inclusions.map((i) => ({ key: i.key, label: i.label, qty: Number(i.qty) })),
      allowance: allowance.trim() === "" ? null : Number(allowance),
      half_day_cap: cap.trim() === "" ? null : Math.round(Number(cap) * 2),
    });
  });

  const switching = p.mode !== "package" && mode === "package" && started <= dubaiToday();
  return (
    <section className="ad-card ad-form" aria-label="Plan" data-testid="client-plan">
      <h2 className="ad-h2">Plan</h2>
      {p.mode === "budget" && (
        <p className="ad-note ad-m0">
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
              <label htmlFor="plan-billing">Package invoice</label>
              <select
                id="plan-billing"
                value={billing}
                onChange={(e) => setBilling(e.target.value as "usage" | "upfront")}
              >
                <option value="usage">Month end — pay for what you use</option>
                <option value="upfront">Start of month — pay upfront</option>
              </select>
              <span className="ad-help">
                {billing === "usage"
                  ? "The allowance is a tracker: the month-end invoice is the month’s work at their prices, minus what they paid at booking. Work beyond it goes on the same invoice. No rollover."
                  : "The monthly amount is invoiced on the 1st. Unused allowance and days roll over (below); work beyond them goes on next month’s invoice."}
              </span>
            </div>
            {billing === "usage" ? (
              <div className="ad-field">
                <label htmlFor="plan-minimum">Minimum monthly amount ({data.currency})</label>
                <input
                  id="plan-minimum"
                  inputMode="decimal"
                  value={minimum}
                  placeholder="Blank: usage only"
                  onChange={(e) => setMinimum(e.target.value)}
                />
                <span className="ad-help">Billed when the month’s work comes to less.</span>
              </div>
            ) : (
              <div />
            )}
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
                  Start now
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
          </div>
          <span className="ad-small ad-muted" data-testid="plan-months-note">
            Calendar months, no pro-rating: every month has the full allowance and shoot days, the
            first one too.
            {billing === "upfront" &&
            (switching || started.slice(8) !== "01" || p.billing !== "upfront")
              ? " Starting mid-month, this month is billed on usage at month end; upfront billing starts on the 1st."
              : ""}
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
            the half/full-day rate. Property shoots count their price, not shoot days.
          </span>
          {switching && (
            <span className="ad-small" data-testid="plan-switch-note">
              Switching from pay as you go: this month’s work counts toward the package. You’ll see
              what moves before it saves.
            </span>
          )}
          {billing === "upfront" && rollover}
        </>
      )}
      <Confirm
        open={!!ask}
        title="Move this month onto the package?"
        confirmLabel="Save and move"
        onConfirm={() => ask?.done(true)}
        onCancel={() => ask?.done(false)}
      >
        {ask && <SwitchSummary s={ask.s} currency={data.currency} />}
      </Confirm>
    </section>
  );
}
