"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import {
  closeRequest,
  confirmSixMonths,
  previewOffer,
  publishOffer,
  saveLevels,
  type OfferInput,
} from "@/lib/portal/admin-package-actions";
import { dubaiToday, money } from "@/lib/portal/billing";
import {
  editsLabel,
  hoursFromVolume,
  levelLabel,
  LONG_MINUTES,
  NEED_LABEL,
  savingsLine,
  sixMonthLine,
  splitHours,
  splitLabel,
  type PackageLevel,
  type PackageOffer,
  type PackageRequest,
} from "@/lib/portal/package-builder";

/**
 * Admin → Money → Package requests (owner, 28 Oct 2026): the builder, prefilled from the client's
 * request (hours from volume, full days first; edits; price at the right level; the pay-as-you-go
 * comparison). Every number on screen is the database's (portal_admin_preview_package_offer), so what
 * you see is what gets published.
 */
export type RequestDetail = PackageRequest & {
  account: string;
  account_id: string;
  currency: string;
  plan_mode: string;
  notes: string | null;
  created_email: string | null;
  this_month: number | null;
  rates: {
    half_day: number | null;
    full_day: number | null;
    short_edit: number | null;
    long_edit: number | null;
    levels: PackageLevel[];
    six_month_pct: number;
  };
};

const nextFirst = () => {
  const [y, m] = dubaiToday().split("-").map(Number);
  return m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
};
const int = (v: string) => Math.max(0, Math.floor(Number(v) || 0));

function initial(r: RequestDetail): OfferInput {
  const o = r.offer;
  if (o)
    return {
      name: o.name,
      full_days: o.full_days,
      half_days: o.half_days,
      short_edits: o.short_edits,
      long_edits: o.long_edits,
      long_minutes: o.long_minutes,
      property_value: o.property_value,
      discount_pct: o.discount_pct,
      price: o.price,
      start: o.start,
      usage_enabled: o.usage_enabled,
      minimum: o.minimum,
      six_enabled: o.six_enabled,
      note: o.note ?? "",
    };
  const v = r.volume;
  const edit = r.needs.includes("editing");
  const sp = splitHours(edit ? 0 : hoursFromVolume(v.short, v.long));
  return {
    name: "Monthly package",
    full_days: sp.full,
    half_days: sp.half,
    short_edits: v.short,
    long_edits: v.long,
    long_minutes: v.long_minutes ?? 10,
    property_value: 0,
    discount_pct: null,
    price: null,
    start: nextFirst(),
    usage_enabled: r.payment_pref === "usage",
    minimum: null,
    six_enabled: true,
    note: "",
  };
}

export function OfferBuilder({ r }: { r: RequestDetail }) {
  const router = useRouter();
  const [o, setO] = useState<OfferInput>(() => initial(r));
  const [preview, setPreview] = useState<PackageOffer | null>(null);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [pending, start] = useTransition();
  const seq = useRef(0);
  const m = (n: number) => money(r.currency, n);
  const set = <K extends keyof OfferInput>(k: K, v: OfferInput[K]) =>
    setO((c) => ({ ...c, [k]: v }));
  const hours = (o.full_days * 2 + o.half_days) * 4;
  const decided = r.status === "accepted" || r.status === "closed";

  // The live numbers, from the same function the published offer uses.
  useEffect(() => {
    const n = ++seq.current;
    const t = setTimeout(async () => {
      const res = await previewOffer(r.id, o);
      if (n !== seq.current) return;
      if (res.ok && res.data) {
        setPreview(res.data);
        setErr("");
      } else setErr(res.error ?? "");
    }, 300);
    return () => clearTimeout(t);
  }, [o, r.id]);

  const numField = (label: string, k: keyof OfferInput, help?: string, nullable = false) => (
    <div className="ad-field">
      <label htmlFor={`ob-${k}`}>{label}</label>
      <input
        id={`ob-${k}`}
        inputMode="decimal"
        value={o[k] == null ? "" : String(o[k])}
        placeholder={help}
        onChange={(e) =>
          set(
            k,
            (nullable && e.target.value.trim() === ""
              ? null
              : k === "property_value" || k === "price" || k === "minimum" || k === "discount_pct"
                ? Math.max(0, Number(e.target.value) || 0)
                : int(e.target.value)) as never,
          )
        }
        disabled={decided}
      />
    </div>
  );

  return (
    <div className="ad-stack">
      <section className="ad-card" aria-label="Their request">
        <span className="ad-eb">What they asked for</span>
        <ul className="ad-lines">
          <li>
            <span>Needs</span>
            <span>{r.needs.map((n) => NEED_LABEL[n]).join(", ")}</span>
          </li>
          <li>
            <span>Per month</span>
            <span>
              {r.volume.short} short-form · {r.volume.long} long-form
              {r.volume.long && r.volume.long_minutes
                ? ` (~${r.volume.long_minutes} min)`
                : ""} · {r.volume.property} property shoots
            </span>
          </li>
          <li>
            <span>Payment</span>
            <span>
              {r.payment_pref === "upfront" ? "Upfront" : "Pay for what they use"}
              {r.six_months ? " · interested in 6 months" : ""}
            </span>
          </li>
          {r.scripting && (
            <li>
              <span>Scripting / strategy</span>
              <b>Yes — follow up</b>
            </li>
          )}
          {r.notes && (
            <li>
              <span>Notes</span>
              <span>{r.notes}</span>
            </li>
          )}
          {r.this_month != null && Number(r.this_month) > 0 && (
            <li>
              <span>Booked this month (pay as you go)</span>
              <span className="ad-mono">{m(Number(r.this_month))}</span>
            </li>
          )}
        </ul>
      </section>

      <section className="ad-card" aria-label="Build the package">
        <span className="ad-eb">Package</span>
        <div className="ad-field">
          <label htmlFor="ob-name">Name</label>
          <input
            id="ob-name"
            maxLength={60}
            value={o.name}
            onChange={(e) => set("name", e.target.value)}
            disabled={decided}
          />
        </div>
        <div className="ad-grid3">
          {numField("Full days (8 h)", "full_days")}
          {numField("Half days (4 h)", "half_days")}
          <div className="ad-field">
            <span>Hours</span>
            <b className="ad-mono">{hours} h</b>
            <span className="ad-help">{splitLabel(o.full_days, o.half_days)}</span>
          </div>
        </div>
        {hours > 0 && (
          <div className="ad-btns">
            <button
              type="button"
              className="ad-btn small ghost"
              disabled={decided}
              onClick={() => {
                const sp = splitHours(hours);
                setO((c) => ({ ...c, full_days: sp.full, half_days: sp.half }));
              }}
            >
              Full days first
            </button>
            <button
              type="button"
              className="ad-btn small ghost"
              disabled={decided}
              onClick={() => setO((c) => ({ ...c, full_days: 0, half_days: hours / 4 }))}
            >
              All half days ({hours / 4})
            </button>
          </div>
        )}
        <div className="ad-grid3">
          {numField("Short-form edits", "short_edits")}
          {numField("Long-form edits", "long_edits")}
          <div className="ad-field">
            <label htmlFor="ob-len">Long-form length</label>
            <select
              id="ob-len"
              value={o.long_minutes}
              onChange={(e) => set("long_minutes", Number(e.target.value))}
              disabled={decided}
            >
              {LONG_MINUTES.map((x) => (
                <option key={x} value={x}>
                  {x} min
                </option>
              ))}
            </select>
          </div>
        </div>
        {(r.needs.includes("property") || o.property_value > 0) &&
          numField(
            `Property shoots (${r.currency} a month at their prices; they asked for ${r.volume.property})`,
            "property_value",
            "0",
          )}
        <div className="ad-grid3">
          {numField(
            "Discount %",
            "discount_pct",
            preview ? `${preview.level.pct ?? "custom"} (level)` : "level",
            true,
          )}
          {numField(
            `Monthly price (${r.currency})`,
            "price",
            preview ? String(preview.price) : "auto",
            true,
          )}
          <div className="ad-field">
            <label htmlFor="ob-start">Starts</label>
            <input
              id="ob-start"
              type="date"
              value={o.start}
              onChange={(e) => set("start", e.target.value)}
              disabled={decided}
            />
            <span className="ad-help">A 1st. This month only if nothing is booked yet.</span>
          </div>
        </div>
      </section>

      <section className="ad-card" aria-label="Payment options">
        <span className="ad-eb">Payment options</span>
        <span className="ad-help">
          Upfront monthly is always offered (month 1 is always upfront).
        </span>
        <label className="ad-check">
          <input
            type="checkbox"
            checked={o.usage_enabled}
            onChange={(e) => set("usage_enabled", e.target.checked)}
            disabled={decided}
          />
          <span>Allow pay for what you use (from month 2, at package rates)</span>
        </label>
        {o.usage_enabled &&
          numField(`Minimum a month (${r.currency}, optional)`, "minimum", "none", true)}
        <label className="ad-check">
          <input
            type="checkbox"
            checked={o.six_enabled}
            onChange={(e) => set("six_enabled", e.target.checked)}
            disabled={decided}
          />
          <span>Offer 6 months ({r.rates.six_month_pct}% off, two bank-transfer instalments)</span>
        </label>
        <div className="ad-field">
          <label htmlFor="ob-note">Note to the client (optional)</label>
          <textarea
            id="ob-note"
            rows={2}
            maxLength={500}
            value={o.note}
            onChange={(e) => set("note", e.target.value)}
            disabled={decided}
          />
        </div>
      </section>

      <section className="ad-card" aria-label="The numbers" data-testid="offer-preview">
        <span className="ad-eb">The numbers</span>
        {preview ? (
          <ul className="ad-lines">
            {hours > 0 && (
              <li>
                <span>
                  Shoot · {splitLabel(preview.full_days, preview.half_days)} (
                  {m(Number(preview.rates.full_day ?? 0))} /{" "}
                  {m(Number(preview.rates.half_day ?? 0))})
                </span>
                <span className="ad-mono">
                  {m(
                    preview.full_days * Number(preview.rates.full_day ?? 0) +
                      preview.half_days * Number(preview.rates.half_day ?? 0),
                  )}
                </span>
              </li>
            )}
            {preview.edits > 0 && (
              <li>
                <span>{editsLabel(preview)}</span>
                <span className="ad-mono">
                  {m(
                    preview.short_edits * Number(preview.rates.short_edit ?? 0) +
                      preview.long_edits * Number(preview.rates.long_edit ?? 0),
                  )}
                </span>
              </li>
            )}
            {preview.property_value > 0 && (
              <li>
                <span>Property shoots</span>
                <span className="ad-mono">{m(preview.property_value)}</span>
              </li>
            )}
            <li>
              <b>Pay as you go</b>
              <b className="ad-mono">{m(preview.payg_total)}</b>
            </li>
            <li>
              <span>
                Level: from {m(preview.level.from)} · {levelLabel(preview.level.pct)}
                {o.discount_pct != null ? ` · using ${preview.discount_pct}%` : ""}
              </span>
              <span className="ad-mono">− {preview.discount_pct}%</span>
            </li>
            <li>
              <b>Monthly price</b>
              <b className="ad-mono">{m(preview.price)}</b>
            </li>
            <li>
              <span>{savingsLine(preview) ?? "No saving vs pay as you go"}</span>
              <span />
            </li>
            {o.six_enabled && (
              <li>
                <span>6 months</span>
                <span className="ad-mono">{sixMonthLine(preview)}</span>
              </li>
            )}
            <li>
              <span>Extras beyond the package</span>
              <span>at {preview.discount_pct}% off their prices</span>
            </li>
          </ul>
        ) : (
          <p className="ad-small ad-muted">{err || "Working it out…"}</p>
        )}
        {preview && err && <p className="ad-note warn">{err}</p>}
        {msg && (
          <p className="ad-note" role="status">
            {msg}
          </p>
        )}
        <div className="ad-btns">
          {(r.status === "new" || r.status === "offered") && (
            <button
              type="button"
              className="ad-btn"
              disabled={pending || !preview || !!err}
              onClick={() =>
                start(async () => {
                  const res = await publishOffer(r.id, o);
                  if (!res.ok) return setErr(res.error ?? "Couldn’t publish.");
                  setMsg(res.notice ?? "Published.");
                  router.refresh();
                })
              }
            >
              {r.status === "offered" ? "Update the offer" : "Publish to the client"}
            </button>
          )}
          {r.status === "six_requested" && (
            <>
              <button
                type="button"
                className="ad-btn"
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    const res = await confirmSixMonths(r.id);
                    if (!res.ok) return setErr(res.error ?? "Couldn’t confirm.");
                    setMsg(res.notice ?? "Confirmed.");
                    router.refresh();
                  })
                }
              >
                Confirm the 6-month plan
              </button>
              <button
                type="button"
                className="ad-btn ghost"
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    const res = await closeRequest(r.id, true);
                    if (!res.ok) return setErr(res.error ?? "Couldn’t save.");
                    setMsg(res.notice ?? "");
                    router.refresh();
                  })
                }
              >
                Decline 6 months, keep the offer
              </button>
            </>
          )}
          {!decided && (
            <button
              type="button"
              className="ad-btn ghost"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const res = await closeRequest(r.id);
                  if (!res.ok) return setErr(res.error ?? "Couldn’t close.");
                  router.push("/admin/billing/package-requests");
                })
              }
            >
              Close request
            </button>
          )}
        </div>
      </section>
    </div>
  );
}

/** The discount levels by monthly pay-as-you-go value, and the 6-month discount. */
export function LevelsEditor({
  levels,
  sixMonthPct,
}: {
  levels: PackageLevel[];
  sixMonthPct: number;
}) {
  const router = useRouter();
  const [rows, setRows] = useState(
    levels.map((l) => ({ from: String(l.from), pct: l.pct == null ? "" : String(l.pct) })),
  );
  const [six, setSix] = useState(String(sixMonthPct));
  const [msg, setMsg] = useState("");
  const [pending, start] = useTransition();
  return (
    <details className="ad-card">
      <summary className="ad-small">
        Discount levels: {levels.map((l) => `${l.from / 1000}K+ ${levelLabel(l.pct)}`).join(" · ")}
      </summary>
      <span className="ad-help">
        By the month’s value at pay-as-you-go prices. Leave the % empty for “custom” (you set it per
        package).
      </span>
      {rows.map((r, i) => (
        <div key={i} className="ad-grid3">
          <div className="ad-field">
            <label htmlFor={`lv-from-${i}`}>From (AED)</label>
            <input
              id={`lv-from-${i}`}
              inputMode="decimal"
              value={r.from}
              disabled={i === 0}
              onChange={(e) =>
                setRows(rows.map((x, j) => (j === i ? { ...x, from: e.target.value } : x)))
              }
            />
          </div>
          <div className="ad-field">
            <label htmlFor={`lv-pct-${i}`}>Discount %</label>
            <input
              id={`lv-pct-${i}`}
              inputMode="decimal"
              value={r.pct}
              placeholder="custom"
              onChange={(e) =>
                setRows(rows.map((x, j) => (j === i ? { ...x, pct: e.target.value } : x)))
              }
            />
          </div>
          <div className="ad-field">
            {i > 0 && (
              <button
                type="button"
                className="ad-btn small ghost"
                onClick={() => setRows(rows.filter((_, j) => j !== i))}
              >
                Remove
              </button>
            )}
          </div>
        </div>
      ))}
      <div className="ad-btns">
        <button
          type="button"
          className="ad-btn small ghost"
          disabled={rows.length >= 8}
          onClick={() => setRows([...rows, { from: "", pct: "" }])}
        >
          Add a level
        </button>
      </div>
      <div className="ad-field">
        <label htmlFor="lv-six">6-month discount %</label>
        <input
          id="lv-six"
          inputMode="decimal"
          value={six}
          onChange={(e) => setSix(e.target.value)}
        />
      </div>
      {msg && (
        <p className="ad-note" role="status">
          {msg}
        </p>
      )}
      <div className="ad-btns">
        <button
          type="button"
          className="ad-btn"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const res = await saveLevels(
                rows.map((x) => ({
                  from: Number(x.from) || 0,
                  pct: x.pct.trim() === "" ? null : Number(x.pct),
                })),
                Number(six) || 0,
              );
              setMsg(res.ok ? (res.notice ?? "Saved.") : (res.error ?? "Couldn’t save."));
              if (res.ok) router.refresh();
            })
          }
        >
          Save levels
        </button>
      </div>
    </details>
  );
}
