"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { money } from "@/lib/portal/billing";
import {
  DELIVERABLE_STATUS,
  deliverablesFrom,
  type Deliverable,
  type DeliverableDraft,
  type LogLine,
} from "@/lib/portal/booking";
import {
  logShoot,
  saveDeliverables,
  setDeliverable,
  type ShootResult,
} from "@/lib/portal/shoot-actions";

function Note({ r, pending }: { r?: ShootResult; pending?: boolean }) {
  if (pending) return <span className="ad-small ad-muted">Saving…</span>;
  if (!r) return null;
  return (
    <span className={r.ok ? "ad-small" : "ad-err"} role={r.ok ? "status" : "alert"}>
      {r.ok ? r.notice : r.error}
    </span>
  );
}

export type RateOption = { key: string; label: string; unit: string; amount: number | null };

/**
 * "Log what we shot" (owner, 10 Oct 2026): prefilled from what the client asked for; change
 * quantities, add items that weren't requested, remove items. Prices fill in from the client's
 * rates (property shoots from the price list); a manual price needs a reason. Saving creates the
 * items behind the client's activity, statements and invoice drafts. No email.
 */
export function ShootLog({
  project,
  currency,
  rates,
  initial,
  logged,
  hasDeliverables,
  locked,
}: {
  project: string;
  currency: string;
  rates: RateOption[];
  initial: LogLine[];
  logged: boolean;
  hasDeliverables: boolean;
  locked: boolean;
}) {
  const router = useRouter();
  const [lines, setLines] = useState<LogLine[]>(initial);
  const [r, setR] = useState<ShootResult>();
  const [pending, start] = useTransition();
  const rateOf = (key: string) => rates.find((x) => x.key === key)?.amount ?? null;
  const priceOf = (l: LogLine) =>
    l.basis === "client_rate" ? rateOf(l.key) : l.unit_price != null ? Number(l.unit_price) : null;
  const total = lines.reduce((t, l) => t + (priceOf(l) ?? 0) * l.qty, 0);
  const set = (i: number, patch: Partial<LogLine>) =>
    setLines((ls) => ls.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const preview = hasDeliverables ? [] : deliverablesFrom(lines);
  const options = rates.filter((x) => x.key !== "shoot");

  return (
    <section className="ad-card ad-form" aria-label="Log what we shot" data-testid="shoot-log">
      <div className="ad-row-between">
        <h2 className="ad-h2" style={{ margin: 0 }}>
          Log what we shot
        </h2>
        <span className="ad-small ad-muted">{logged ? "Logged" : "Not logged yet"}</span>
      </div>
      {locked && (
        <p className="ad-note" style={{ margin: 0 }}>
          These items are already on an invoice. Change them on the invoice draft instead.
        </p>
      )}
      <div className="ad-log" role="table" aria-label="Items">
        {lines.map((l, i) => {
          const price = priceOf(l);
          return (
            <div className="ad-log-row" role="row" key={i} data-testid="log-line">
              {l.key === "property" ? (
                <span className="ad-small" role="cell">
                  Property shoot (price list)
                </span>
              ) : (
                <select
                  aria-label={`Item ${i + 1}: service`}
                  value={l.key}
                  disabled={locked}
                  onChange={(e) => set(i, { key: e.target.value })}
                >
                  {options.map((o) => (
                    <option key={o.key} value={o.key}>
                      {o.label}
                    </option>
                  ))}
                </select>
              )}
              <input
                aria-label={`Item ${i + 1}: description`}
                value={l.description}
                maxLength={200}
                disabled={locked}
                onChange={(e) => set(i, { description: e.target.value })}
              />
              <input
                aria-label={`Item ${i + 1}: quantity`}
                type="number"
                min={1}
                value={l.qty}
                disabled={locked}
                onChange={(e) => set(i, { qty: Number(e.target.value) })}
              />
              {l.basis === "override" ? (
                <input
                  aria-label={`Item ${i + 1}: price`}
                  inputMode="decimal"
                  value={l.unit_price ?? ""}
                  disabled={locked}
                  onChange={(e) =>
                    set(i, {
                      unit_price: e.target.value === "" ? undefined : Number(e.target.value),
                    })
                  }
                />
              ) : (
                <span className="ad-mono" role="cell" data-testid="log-price">
                  {price != null ? money(currency, price) : "no rate yet"}
                </span>
              )}
              <label className="ad-check ad-small">
                <input
                  type="checkbox"
                  checked={l.basis === "override"}
                  disabled={locked}
                  onChange={(e) =>
                    set(i, {
                      basis: e.target.checked
                        ? "override"
                        : l.key === "property"
                          ? "price_list"
                          : "client_rate",
                      unit_price: e.target.checked ? (price ?? undefined) : l.unit_price,
                      list_price: price ?? undefined,
                    })
                  }
                />
                <span>Change price</span>
              </label>
              <button
                type="button"
                className="ad-icon-btn"
                aria-label={`Remove item ${i + 1}`}
                disabled={locked}
                onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}
              >
                ×
              </button>
              {l.basis === "override" && (
                <input
                  className="ad-log-reason"
                  aria-label={`Item ${i + 1}: why the price changed`}
                  placeholder="Why the price changed (required)"
                  value={l.reason ?? ""}
                  maxLength={300}
                  disabled={locked}
                  onChange={(e) => set(i, { reason: e.target.value })}
                />
              )}
            </div>
          );
        })}
      </div>
      <div className="ad-btns" style={{ alignItems: "center" }}>
        <button
          type="button"
          className="ad-btn ghost small"
          disabled={locked}
          onClick={() =>
            setLines((ls) => [
              ...ls,
              {
                key: options[0]?.key ?? "reel",
                description: options[0]?.label ?? "",
                qty: 1,
                basis: "client_rate",
              },
            ])
          }
        >
          Add an item
        </button>
        <span className="ad-small">
          Total <b data-testid="log-total">{money(currency, Math.round(total * 100) / 100)}</b>
        </span>
      </div>
      {preview.length > 0 && (
        <p className="ad-small ad-muted" data-testid="deliverables-preview" style={{ margin: 0 }}>
          Creates deliverables: {preview.map((d) => d.label).join(", ")}.
        </p>
      )}
      <div className="ad-btns" style={{ alignItems: "center" }}>
        <button
          type="button"
          className="ad-btn small"
          disabled={pending || locked}
          onClick={() =>
            start(async () => {
              const res = await logShoot(project, lines, preview);
              setR(res);
              if (res.ok) router.refresh();
            })
          }
        >
          {logged ? "Save the log" : "Log it"}
        </button>
        <Note r={r} pending={pending} />
      </div>
    </section>
  );
}

const KINDS: [DeliverableDraft["kind"], string][] = [
  ["reel", "Reel"],
  ["long_form", "Long-form"],
  ["photos", "Photos"],
  ["tour", "360 tour"],
  ["video", "Video"],
  ["other", "Other"],
];

type Revision = { round: number; note: string; requested_by_name: string | null; at: string };

/**
 * The booking's deliverables: each with its status (Editing → Delivered → In revision → Delivered
 * → Approved), shown live to the client, and its own revision rounds (2 each; add one if needed).
 * 360 tours and long-form can be a link (Matterport, Panoee, Kuula; YouTube or Vimeo).
 */
export function DeliverablesAdmin({
  project,
  items,
}: {
  project: string;
  items: (Deliverable & { revisions: Revision[] })[];
}) {
  const router = useRouter();
  const [list, setList] = useState(
    items.map((d) => ({ id: d.id, label: d.label, kind: d.kind, link_url: d.link_url ?? "" })),
  );
  const [r, setR] = useState<ShootResult>();
  const [pending, start] = useTransition();
  const byId = new Map(items.map((d) => [d.id, d]));
  const set = (i: number, patch: Partial<(typeof list)[number]>) =>
    setList((ls) => ls.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  return (
    <section className="ad-card ad-form" aria-label="Deliverables" data-testid="deliverables-admin">
      <h2 className="ad-h2">Deliverables</h2>
      {list.length === 0 && (
        <p className="ad-small ad-muted" style={{ margin: 0 }}>
          None yet. They’re created from “Log what we shot”, or add them here.
        </p>
      )}
      {list.map((d, i) => {
        const saved = d.id ? byId.get(d.id) : undefined;
        return (
          <div className="ad-deliv" key={d.id ?? `new-${i}`} data-testid="deliverable-row">
            <input
              aria-label={`Deliverable ${i + 1}: name`}
              value={d.label}
              maxLength={80}
              onChange={(e) => set(i, { label: e.target.value })}
            />
            <select
              aria-label={`Deliverable ${i + 1}: kind`}
              value={d.kind}
              onChange={(e) => set(i, { kind: e.target.value as DeliverableDraft["kind"] })}
            >
              {KINDS.map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </select>
            <input
              aria-label={`Deliverable ${i + 1}: link`}
              placeholder={
                d.kind === "tour"
                  ? "360 tour link (Matterport, Panoee, Kuula or any https link)"
                  : d.kind === "long_form" || d.kind === "video"
                    ? "YouTube or Vimeo link (optional)"
                    : "Link (optional)"
              }
              value={d.link_url}
              onChange={(e) => set(i, { link_url: e.target.value })}
            />
            {saved ? (
              <>
                <select
                  aria-label={`${saved.label}: status`}
                  value={saved.status}
                  disabled={pending}
                  onChange={(e) =>
                    start(async () => {
                      const res = await setDeliverable(project, saved.id, e.target.value);
                      setR(res);
                      if (res.ok) router.refresh();
                    })
                  }
                >
                  {Object.entries(DELIVERABLE_STATUS).map(([k, l]) => (
                    <option key={k} value={k}>
                      {l}
                    </option>
                  ))}
                </select>
                <span className="ad-small" data-testid="rounds">
                  Revisions {saved.rounds_used} of {saved.rounds_allowed}
                </span>
                <button
                  type="button"
                  className="ad-btn quiet small"
                  disabled={pending}
                  onClick={() =>
                    start(async () => {
                      const res = await setDeliverable(project, saved.id, null, true);
                      setR(res);
                      if (res.ok) router.refresh();
                    })
                  }
                >
                  Add a round
                </button>
              </>
            ) : (
              <span className="ad-small ad-muted">New</span>
            )}
            <button
              type="button"
              className="ad-icon-btn"
              aria-label={`Remove deliverable ${i + 1}`}
              onClick={() => setList((ls) => ls.filter((_, j) => j !== i))}
            >
              ×
            </button>
            {saved?.revisions.length ? (
              <ul className="ad-history ad-deliv-revs">
                {saved.revisions.map((v) => (
                  <li key={v.round}>
                    Round {v.round}: “{v.note}”
                    <span className="ad-muted">
                      {" "}
                      · {v.requested_by_name ?? "client"},{" "}
                      {new Date(v.at).toLocaleDateString("en-GB", {
                        day: "numeric",
                        month: "short",
                      })}
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        );
      })}
      <div className="ad-btns" style={{ alignItems: "center" }}>
        <button
          type="button"
          className="ad-btn ghost small"
          onClick={() =>
            setList((ls) => [...ls, { id: "", label: "", kind: "reel", link_url: "" }])
          }
        >
          Add a deliverable
        </button>
        <button
          type="button"
          className="ad-btn small"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const res = await saveDeliverables(
                project,
                list.map((d) => ({
                  ...(d.id ? { id: d.id } : {}),
                  label: d.label,
                  kind: d.kind,
                  link_url: d.link_url.trim() || null,
                })),
              );
              setR(res);
              if (res.ok) router.refresh();
            })
          }
        >
          Save deliverables
        </button>
        <Note r={r} pending={pending} />
      </div>
    </section>
  );
}
