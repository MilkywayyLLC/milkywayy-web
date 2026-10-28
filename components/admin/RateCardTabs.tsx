"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { saveRate } from "@/lib/portal/admin-billing-actions";
import { cx } from "@/lib/cx";
import type { RateRow } from "./BillingTools";

type TabKey = "property" | "content" | "editing" | "other";

const TABS: { key: TabKey; label: string }[] = [
  { key: "property", label: "Property shoots" },
  { key: "content", label: "Content shoots" },
  { key: "editing", label: "Editing" },
  { key: "other", label: "Other" },
];

/** Which tab and heading a rate sits under. The keys stay as they are. */
function place(key: string): { tab: TabKey; group: string } {
  if (/^prop_photo_apt_/.test(key)) return { tab: "property", group: "Photos · Apartments" };
  if (/^prop_photo_villa_/.test(key)) return { tab: "property", group: "Photos · Villas" };
  if (/^prop_/.test(key) || key === "shoot" || key === "shoot_day")
    return { tab: "property", group: "Videography, tours & extras" };
  if (/^content_(2|4|8)h$/.test(key)) return { tab: "content", group: "Shoot length" };
  if (key === "content_short_edit" || key === "content_long_edit")
    return { tab: "content", group: "Edits" };
  if (/^content_long_\d+$/.test(key)) return { tab: "content", group: "Long-form by length" };
  if (key === "content_overtime") return { tab: "content", group: "Overtime" };
  if (
    ["reel_shoot", "long_form_shoot", "long_form_extra_min", "half_day", "full_day"].includes(
      key,
    ) ||
    /^min_(half|full)_day$/.test(key)
  )
    return { tab: "content", group: "Shot & edited / flexible (older bookings)" };
  if (["reel", "long_form", "edit_long_extra", "photo"].includes(key))
    return { tab: "editing", group: "Edits" };
  if (/^avatar_/.test(key)) return { tab: "editing", group: "AI avatars" };
  return { tab: "other", group: "Other" };
}

type Draft = { label: string; unit: string; aed: string; usd: string };
const toDraft = (r: RateRow): Draft => ({
  label: r.label,
  unit: r.unit,
  aed: r.amount_aed == null ? "" : String(r.amount_aed),
  usd: r.amount_usd == null ? "" : String(r.amount_usd),
});
const same = (a: Draft, b: Draft) =>
  a.label === b.label && a.unit === b.unit && a.aed === b.aed && a.usd === b.usd;
const amount = (s: string) => (s.trim() === "" ? null : Number(s));

/** Admin → Prices & packages → Portal rate card: three tabs (and Other), one Save per tab. */
export function RateCardTabs({ rows }: { rows: RateRow[] }) {
  const router = useRouter();
  const [tab, setTab] = useState<TabKey>("property");
  const initial = Object.fromEntries(rows.map((r) => [r.key, toDraft(r)]));
  const [draft, setDraft] = useState<Record<string, Draft>>(initial);
  const [added, setAdded] = useState({ key: "", ...toDraft({ label: "", unit: "" } as RateRow) });
  const [msg, setMsg] = useState<Record<string, { ok: boolean; text: string }>>({});
  const [pending, start] = useTransition();

  const inTab = (t: TabKey) => rows.filter((r) => place(r.key).tab === t);
  const dirtyIn = (t: TabKey) =>
    inTab(t).filter((r) => !same(draft[r.key] ?? initial[r.key], initial[r.key]));
  const set = (key: string, k: keyof Draft, v: string) =>
    setDraft((d) => ({ ...d, [key]: { ...(d[key] ?? initial[key]), [k]: v } }));

  function save(t: TabKey) {
    const todo = dirtyIn(t);
    const nu = t === "other" && added.key.trim() !== "";
    if (!todo.length && !nu)
      return setMsg((m) => ({ ...m, [t]: { ok: true, text: "No changes." } }));
    start(async () => {
      for (const r of todo) {
        const d = draft[r.key];
        const res = await saveRate({
          key: r.key,
          label: d.label,
          unit: d.unit,
          aed: amount(d.aed),
          usd: amount(d.usd),
          sort: r.sort,
        });
        if (!res.ok)
          return setMsg((m) => ({
            ...m,
            [t]: { ok: false, text: `${d.label}: ${res.error ?? "couldn’t save"}` },
          }));
      }
      if (nu) {
        const res = await saveRate({
          key: added.key.trim(),
          label: added.label,
          unit: added.unit,
          aed: amount(added.aed),
          usd: amount(added.usd),
          sort: 100,
        });
        if (!res.ok)
          return setMsg((m) => ({ ...m, [t]: { ok: false, text: res.error ?? "couldn’t save" } }));
        setAdded({ key: "", label: "", unit: "", aed: "", usd: "" });
      }
      setMsg((m) => ({
        ...m,
        [t]: {
          ok: true,
          text: `Saved ${todo.length + (nu ? 1 : 0)} rate${todo.length + (nu ? 1 : 0) === 1 ? "" : "s"}.`,
        },
      }));
      router.refresh();
    });
  }

  const groups = (t: TabKey) => {
    const out: { name: string; rows: RateRow[] }[] = [];
    for (const r of inTab(t)) {
      const g = place(r.key).group;
      (out.find((x) => x.name === g) ?? out[out.push({ name: g, rows: [] }) - 1]).rows.push(r);
    }
    return out;
  };

  return (
    <section className="ad-card" data-testid="rate-card">
      <div className="ad-tabs" role="tablist">
        {TABS.map((t) => {
          const n = dirtyIn(t.key).length;
          return (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={tab === t.key}
              onClick={() => setTab(t.key)}
            >
              {t.label}
              {n > 0 ? ` •` : ""}
            </button>
          );
        })}
      </div>
      <div role="tabpanel" className="ad-ratetab">
        <div className="ad-ratehead" aria-hidden="true">
          <span>Item</span>
          <span>Unit</span>
          <span>AED</span>
          <span>USD</span>
        </div>
        {groups(tab).map((g) => (
          <div key={g.name} className="ad-rategroup">
            {tab !== "other" || groups(tab).length > 1 ? <h3 className="ad-eb">{g.name}</h3> : null}
            {g.rows.map((r) => {
              const d = draft[r.key] ?? initial[r.key];
              return (
                <div key={r.key} className="ad-raterow" role="group" aria-label={`Rate ${r.label}`}>
                  <div className="ad-field">
                    <input
                      aria-label={`Label ${r.key}`}
                      value={d.label}
                      onChange={(e) => set(r.key, "label", e.target.value)}
                    />
                    <span className="ad-help ad-mono">{r.key}</span>
                  </div>
                  <input
                    aria-label={`Unit ${r.key}`}
                    value={d.unit}
                    placeholder="per…"
                    onChange={(e) => set(r.key, "unit", e.target.value)}
                  />
                  <input
                    aria-label={`AED ${r.key}`}
                    type="number"
                    min={0}
                    step="0.01"
                    value={d.aed}
                    placeholder="AED"
                    onChange={(e) => set(r.key, "aed", e.target.value)}
                  />
                  <input
                    aria-label={`USD ${r.key}`}
                    type="number"
                    min={0}
                    step="0.01"
                    value={d.usd}
                    placeholder="USD"
                    onChange={(e) => set(r.key, "usd", e.target.value)}
                  />
                </div>
              );
            })}
          </div>
        ))}
        {tab === "other" && (
          <div className="ad-rategroup">
            <h3 className="ad-eb">Add a rate</h3>
            <div className="ad-raterow" role="group" aria-label="New rate">
              <div className="ad-field">
                <input
                  aria-label="Label new"
                  value={added.label}
                  placeholder="Label"
                  onChange={(e) => setAdded({ ...added, label: e.target.value })}
                />
                <input
                  aria-label="Key"
                  value={added.key}
                  placeholder="key_like_this"
                  onChange={(e) => setAdded({ ...added, key: e.target.value })}
                />
              </div>
              <input
                aria-label="Unit new"
                value={added.unit}
                placeholder="per…"
                onChange={(e) => setAdded({ ...added, unit: e.target.value })}
              />
              <input
                aria-label="AED new"
                type="number"
                min={0}
                step="0.01"
                value={added.aed}
                placeholder="AED"
                onChange={(e) => setAdded({ ...added, aed: e.target.value })}
              />
              <input
                aria-label="USD new"
                type="number"
                min={0}
                step="0.01"
                value={added.usd}
                placeholder="USD"
                onChange={(e) => setAdded({ ...added, usd: e.target.value })}
              />
            </div>
          </div>
        )}
        {!groups(tab).length && tab !== "other" && (
          <p className="ad-small ad-muted">No rates here yet.</p>
        )}
      </div>
      <div className="ad-savebar">
        <p
          className={cx("ad-status", msg[tab] && (msg[tab].ok ? "ok" : "error"))}
          role="status"
          aria-live="polite"
        >
          {pending
            ? "Saving…"
            : dirtyIn(tab).length
              ? `${dirtyIn(tab).length} unsaved change${dirtyIn(tab).length === 1 ? "" : "s"}.`
              : msg[tab]?.text}
        </p>
        <button type="button" className="ad-btn" disabled={pending} onClick={() => save(tab)}>
          Save {TABS.find((t) => t.key === tab)!.label.toLowerCase()}
        </button>
      </div>
    </section>
  );
}
