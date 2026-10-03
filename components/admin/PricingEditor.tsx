"use client";

import { cx } from "@/lib/cx";
import { useEffect, useState, useTransition } from "react";
import type { CommercialTier, PropertyPricing, ResidentialSize } from "@/content/types";
import {
  discardDocDraft,
  publishPricing,
  savePricingDraft,
  type Result,
} from "@/lib/admin/actions";
import { getPath, setPath, type Change } from "@/lib/admin/fields";
import { COM_COLUMNS, QTYS, RES_COLUMNS } from "@/lib/admin/pricing";
import { Confirm } from "./Confirm";

type Tab = "apartment" | "villa" | "commercial" | "twilight";
const TABS: { key: Tab; label: string }[] = [
  { key: "apartment", label: "Apartments" },
  { key: "villa", label: "Villas" },
  { key: "commercial", label: "Commercial" },
  { key: "twilight", label: "Twilight" },
];
const previewHref = `/admin/preview?path=${encodeURIComponent("/property-shoots#booking")}`;

/** An emptied price box is NaN, which JSON would quietly turn into "not offered". Catch it here. */
const hasBlank = (v: unknown): boolean =>
  typeof v === "number"
    ? Number.isNaN(v)
    : !!v && typeof v === "object" && Object.values(v).some(hasBlank);

/** A whole-number AED input; "" while typing becomes NaN, which the check flags. */
function Price({
  value,
  base,
  onChange,
  label,
  nullable,
}: {
  value: number | null;
  base: number | null | undefined;
  onChange: (v: number | null) => void;
  label: string;
  nullable?: boolean;
}) {
  const off = value === null;
  return (
    <td className={cx("ad-num", value !== base && "ad-changed")}>
      <div style={{ display: "grid", gap: 4 }}>
        {!off && (
          <input
            type="number"
            inputMode="numeric"
            min={0}
            step={1}
            aria-label={label}
            value={Number.isFinite(value) ? String(value) : ""}
            onChange={(e) =>
              onChange(e.target.value === "" ? NaN : Math.round(e.target.valueAsNumber))
            }
          />
        )}
        {nullable && (
          <label className="ad-small" style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <input
              type="checkbox"
              checked={off}
              onChange={(e) => onChange(e.target.checked ? null : (base ?? 0))}
            />
            Not offered
          </label>
        )}
      </div>
    </td>
  );
}

function Text({
  value,
  base,
  onChange,
  label,
  nullable,
  width = 140,
}: {
  value: string | null;
  base: string | null | undefined;
  onChange: (v: string | null) => void;
  label: string;
  nullable?: boolean;
  width?: number;
}) {
  const off = value === null;
  return (
    <td className={value !== base ? "ad-changed" : undefined}>
      <div style={{ display: "grid", gap: 4, minWidth: width }}>
        {!off && (
          <input
            type="text"
            aria-label={label}
            value={value}
            onChange={(e) => onChange(e.target.value)}
          />
        )}
        {nullable && (
          <label className="ad-small" style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <input
              type="checkbox"
              checked={off}
              onChange={(e) => onChange(e.target.checked ? null : (base ?? ""))}
            />
            Not included
          </label>
        )}
      </div>
    </td>
  );
}

/**
 * The property-shoot price tables, laid out like the booking builder's price list (guide §8.3).
 * Edits stay a draft until Publish, which shows every change old → new and asks to confirm.
 */
export function PricingEditor({
  live,
  draft,
  history,
}: {
  live: PropertyPricing;
  draft: { value: PropertyPricing; updated_by: string; updated_at: string } | null;
  history: { at: string; admin_email: string; summary: string; details: Change[] }[];
}) {
  const [p, setP] = useState<PropertyPricing>(draft?.value ?? live);
  const [saved, setSaved] = useState(p);
  const [hasDraft, setHasDraft] = useState(!!draft);
  const [tab, setTab] = useState<Tab>("apartment");
  const [status, setStatus] = useState<{ ok: boolean; text: string }>();
  const [review, setReview] = useState<Change[] | null>(null);
  const [pending, start] = useTransition();
  const dirty = JSON.stringify(p) !== JSON.stringify(saved);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const set = (path: string, v: unknown) => setP((cur) => setPath(cur, path, v));
  const failed = (r: Result) => {
    if (r.ok) return false;
    setStatus({ ok: false, text: r.error ?? "Something went wrong." });
    return true;
  };

  const blank = () => {
    if (!hasBlank(p)) return false;
    setStatus({ ok: false, text: "Fill in every price (use 0 if it's free)." });
    return true;
  };

  function saveDraft(then?: () => void) {
    if (blank()) return;
    start(async () => {
      const r = await savePricingDraft(p);
      if (failed(r)) return;
      setSaved(p);
      setHasDraft(true);
      setStatus({
        ok: true,
        text: `Draft saved (${r.changes?.length ?? 0} change${r.changes?.length === 1 ? "" : "s"}). Not live yet.`,
      });
      then?.();
    });
  }
  function askPublish() {
    if (blank()) return;
    start(async () => {
      const r = await publishPricing(p, false);
      if (failed(r)) return;
      if (!r.changes?.length) return setStatus({ ok: false, text: "No prices have changed." });
      setReview(r.changes);
    });
  }
  function publish() {
    start(async () => {
      const r = await publishPricing(p, true);
      setReview(null);
      if (failed(r)) return;
      setSaved(p);
      setHasDraft(false);
      setStatus({
        ok: true,
        text: `Published ${r.changes?.length} change${r.changes?.length === 1 ? "" : "s"}. The booking builder uses them in a few seconds.`,
      });
    });
  }
  function discard() {
    start(async () => {
      const r = await discardDocDraft("pricing_property");
      if (failed(r)) return;
      setP(live);
      setSaved(live);
      setHasDraft(false);
      setStatus({ ok: true, text: "Draft discarded. Showing the live prices." });
    });
  }

  const res = (type: "apartment" | "villa") => {
    const sizes = p[type].sizes;
    const base = live[type].sizes;
    const blank: ResidentialSize = {
      label: "",
      photo: 0,
      short: 0,
      long: { day: 0, night: 0, dayNight: 0 },
      tour: 0,
    };
    return (
      <>
        <div className="ad-scroll">
          <table className="ad-table" aria-label={`${p[type].label} prices (AED)`}>
            <thead>
              <tr>
                <th>Size</th>
                {RES_COLUMNS.map((c) => (
                  <th key={c.key}>{c.label}</th>
                ))}
                <th>First</th>
                <th aria-label="Remove" />
              </tr>
            </thead>
            <tbody>
              {sizes.map((s, i) => (
                <tr key={i}>
                  <Text
                    value={s.label}
                    base={base[i]?.label}
                    label={`Size ${i + 1} name`}
                    width={96}
                    onChange={(v) => set(`${type}.sizes.${i}.label`, v)}
                  />
                  {RES_COLUMNS.map((c) => (
                    <Price
                      key={c.key}
                      value={getPath(s, c.key) as number}
                      base={base[i] ? (getPath(base[i], c.key) as number) : undefined}
                      label={`${p[type].label} ${s.label} ${c.label}`}
                      onChange={(v) => set(`${type}.sizes.${i}.${c.key}`, v)}
                    />
                  ))}
                  <td>
                    <input
                      type="radio"
                      name={`${type}-first`}
                      aria-label={`Select ${s.label} first`}
                      checked={p[type].defaultSize === i}
                      onChange={() => set(`${type}.defaultSize`, i)}
                    />
                  </td>
                  <td>
                    <button
                      type="button"
                      className="ad-icon-btn"
                      aria-label={`Remove ${s.label || `size ${i + 1}`}`}
                      disabled={sizes.length === 1}
                      onClick={() => {
                        set(
                          `${type}.sizes`,
                          sizes.filter((_, j) => j !== i),
                        );
                        if (p[type].defaultSize >= sizes.length - 1) set(`${type}.defaultSize`, 0);
                      }}
                    >
                      ×
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div>
          <button
            type="button"
            className="ad-btn ghost small"
            onClick={() => set(`${type}.sizes`, [...sizes, blank])}
          >
            Add a size
          </button>
        </div>
      </>
    );
  };

  const commercial = () => {
    const tiers = p.commercial.tiers;
    const base = live.commercial.tiers;
    const t = (i: number, path: string, v: unknown) => set(`commercial.tiers.${i}.${path}`, v);
    const blank: CommercialTier = {
      label: "",
      description: "",
      photo: 0,
      short: 0,
      long: null,
      tour: null,
      includes: { photos: "", reel: "", walkthrough: null, tourHotspots: null },
    };
    return (
      <>
        <div className="ad-scroll">
          <table className="ad-table" aria-label="Commercial prices (AED)">
            <thead>
              <tr>
                <th>Tier</th>
                {COM_COLUMNS.map((c) => (
                  <th key={c.key}>{c.label}</th>
                ))}
                <th>Description</th>
                <th>Photos</th>
                <th>Reel</th>
                <th>Walkthrough</th>
                <th>360 hotspots</th>
                <th>Popular</th>
                <th>First</th>
                <th aria-label="Remove" />
              </tr>
            </thead>
            <tbody>
              {tiers.map((tier, i) => (
                <tr key={i}>
                  <Text
                    value={tier.label}
                    base={base[i]?.label}
                    label={`Tier ${i + 1} name`}
                    width={100}
                    onChange={(v) => t(i, "label", v)}
                  />
                  {COM_COLUMNS.map((c) => (
                    <Price
                      key={c.key}
                      value={tier[c.key]}
                      base={base[i]?.[c.key]}
                      label={`Commercial ${tier.label} ${c.label}`}
                      nullable={c.key === "long" || c.key === "tour"}
                      onChange={(v) => t(i, c.key, v)}
                    />
                  ))}
                  <Text
                    value={tier.description}
                    base={base[i]?.description}
                    label={`${tier.label} description`}
                    width={170}
                    onChange={(v) => t(i, "description", v)}
                  />
                  <Text
                    value={tier.includes.photos}
                    base={base[i]?.includes.photos}
                    label={`${tier.label} photos`}
                    width={100}
                    onChange={(v) => t(i, "includes.photos", v)}
                  />
                  <Text
                    value={tier.includes.reel}
                    base={base[i]?.includes.reel}
                    label={`${tier.label} reel`}
                    width={100}
                    onChange={(v) => t(i, "includes.reel", v)}
                  />
                  <Text
                    value={tier.includes.walkthrough}
                    base={base[i]?.includes.walkthrough}
                    label={`${tier.label} walkthrough`}
                    nullable
                    width={110}
                    onChange={(v) => t(i, "includes.walkthrough", v)}
                  />
                  <Text
                    value={tier.includes.tourHotspots}
                    base={base[i]?.includes.tourHotspots}
                    label={`${tier.label} 360 hotspots`}
                    nullable
                    width={140}
                    onChange={(v) => t(i, "includes.tourHotspots", v)}
                  />
                  <td>
                    <input
                      type="checkbox"
                      aria-label={`${tier.label} most popular`}
                      checked={!!tier.popular}
                      onChange={(e) => t(i, "popular", e.target.checked || undefined)}
                    />
                  </td>
                  <td>
                    <input
                      type="radio"
                      name="commercial-first"
                      aria-label={`Select ${tier.label} first`}
                      checked={p.commercial.defaultTier === i}
                      onChange={() => set("commercial.defaultTier", i)}
                    />
                  </td>
                  <td>
                    <button
                      type="button"
                      className="ad-icon-btn"
                      aria-label={`Remove ${tier.label || `tier ${i + 1}`}`}
                      disabled={tiers.length === 1}
                      onClick={() => {
                        set(
                          "commercial.tiers",
                          tiers.filter((_, j) => j !== i),
                        );
                        if (p.commercial.defaultTier >= tiers.length - 1)
                          set("commercial.defaultTier", 0);
                      }}
                    >
                      ×
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="ad-small ad-muted">
          “Not offered” turns that service off for the tier in the booking builder.
        </p>
        <div>
          <button
            type="button"
            className="ad-btn ghost small"
            onClick={() => set("commercial.tiers", [...tiers, blank])}
          >
            Add a tier
          </button>
        </div>
      </>
    );
  };

  const twilight = () => (
    <div className="ad-scroll">
      <table className="ad-table" aria-label="Twilight add-on prices (AED)">
        <thead>
          <tr>
            <th>Property</th>
            {QTYS.map((q) => (
              <th key={q}>{q} photos</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {(["standard", "villa"] as const).map((grp) => (
            <tr key={grp}>
              <td>{grp === "standard" ? "Apartment / commercial" : "Villa"}</td>
              {QTYS.map((q) => (
                <Price
                  key={q}
                  value={p.twilight[grp][q]}
                  base={live.twilight[grp][q]}
                  label={`Twilight ${grp} ${q} photos`}
                  onChange={(v) => set(`twilight.${grp}.${q}`, v)}
                />
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="ad-page">
      <div className="ad-head">
        <div>
          <span className="ad-eb">Pricing · AED</span>
          <h1 className="ad-h1">Property shoots</h1>
        </div>
        <span className={`ad-pill ${hasDraft ? "draft" : "live"}`}>
          {hasDraft ? "Draft" : "Live"}
        </span>
      </div>
      <p className="ad-note">
        {hasDraft && draft
          ? `Showing the draft (saved by ${draft.updated_by}). Changed cells are highlighted against the live prices.`
          : "Showing the live prices. Changed cells are highlighted; nothing goes live until you publish and confirm."}
      </p>
      <div className="ad-card">
        <div className="ad-tabs" role="tablist">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={tab === t.key}
              onClick={() => setTab(t.key)}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div role="tabpanel" style={{ display: "grid", gap: 12 }}>
          {tab === "apartment" && res("apartment")}
          {tab === "villa" && res("villa")}
          {tab === "commercial" && commercial()}
          {tab === "twilight" && twilight()}
        </div>
        <div className="ad-savebar">
          <p
            className={cx("ad-status", status && (status.ok ? "ok" : "error"))}
            role="status"
            aria-live="polite"
            style={{ whiteSpace: "pre-line" }}
          >
            {pending ? "Working…" : dirty ? "Unsaved changes." : status?.text}
          </p>
          <button type="button" className="ad-btn" disabled={pending} onClick={askPublish}>
            Publish…
          </button>
          <button
            type="button"
            className="ad-btn ghost"
            disabled={pending}
            onClick={() => saveDraft()}
          >
            Save draft
          </button>
          <button
            type="button"
            className="ad-btn quiet"
            disabled={pending}
            onClick={() => {
              const w = window.open("about:blank", "_blank");
              saveDraft(() => w && (w.location.href = previewHref));
            }}
          >
            Preview
          </button>
          {hasDraft && (
            <button type="button" className="ad-btn quiet" disabled={pending} onClick={discard}>
              Discard draft
            </button>
          )}
        </div>
      </div>

      <section className="ad-card" aria-label="Price history">
        <h2 className="ad-h2">Price history</h2>
        {history.length === 0 && <p className="ad-muted ad-small">No price changes yet.</p>}
        {history.map((h, i) => (
          <details key={i}>
            <summary>
              <b>
                {new Date(h.at).toLocaleString("en-GB", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                  timeZone: "Asia/Dubai",
                })}
              </b>{" "}
              · {h.admin_email} · {h.summary}
            </summary>
            <div className="ad-changes" style={{ marginTop: 8 }}>
              {h.details.map((c, j) => (
                <div className="ad-change" key={j}>
                  <span className="ad-small ad-muted">{c.label}</span>
                  <span>
                    <s>{c.old}</s> → <b>{c.new}</b>
                  </span>
                </div>
              ))}
            </div>
          </details>
        ))}
      </section>

      <Confirm
        open={!!review}
        title="Confirm price changes"
        changes={review ?? []}
        confirmLabel="Yes, change the prices"
        busy={pending}
        onConfirm={publish}
        onCancel={() => setReview(null)}
      >
        <p>
          {review?.length} change{review?.length === 1 ? "" : "s"}. The booking builder uses the new
          prices as soon as you confirm.
        </p>
      </Confirm>
    </div>
  );
}
