"use client";

import { money } from "@/lib/portal/billing";
import { DAY_LABEL, KEY, packageLines, type EstimateLine } from "@/lib/portal/booking";
import type { RequestConfig } from "@/lib/portal/requests";

/**
 * How Book media shows prices (owner, 18 Oct 2026), by who's looking. Presentation only: the
 * estimate lines and the package split come from lib/portal/booking as before.
 * - Pay as you go: each line's amount and the total.
 * - Monthly package: each line Included (normal price struck through), split ("3 included · 2
 *   extra × AED 400") or an extra; the total counts extras only; "After this booking: …". A
 *   property shoot is always an extra. Without price access: "Included in your package" /
 *   "Extra charges apply", no amounts.
 * - Other packages (budget): ~amounts only with the budget switch on, as before.
 */
export type Shown = {
  key?: string;
  qty: number;
  kind: "priced" | "included" | "split" | "extra" | "flex";
  /** Pay as you go / budget: the line amount. Package: the extra amount. */
  amount: number | null;
  /** Package: the normal price of what's included (struck through). */
  normal: number | null;
  unit: number | null;
  included: number;
  minimum?: boolean;
};
export type PriceView = {
  pkg: boolean;
  /** Amounts may be shown. */
  rates: boolean;
  items: Shown[];
  total: { label: string; value: string } | null;
  /** Package with prices: what's due (extras only). */
  due: number | null;
  /** Package: "After this booking: 13 of 20 reels · 1 of 2 long-form left this month". */
  after: string | null;
  m: (n: number) => string;
};

/** A photo shoot is billed as an extra even on a package (owner, 17 Oct 2026). */
const asExtraIfProperty = <L extends { key?: string }>(l: L): L =>
  l.key === KEY.photos ? { ...l, key: undefined } : l;

const AFTER_NAME: Record<string, [string, string]> = {
  [KEY.short]: ["reel", "reels"],
  [KEY.long]: ["long-form", "long-form"],
};

export function priceView(cfg: RequestConfig, lines: EstimateLine[]): PriceView {
  const p = cfg.price;
  const m = (n: number) => money(p.currency, n);
  const rates = !!p.rates;
  if (p.mode === "package" && p.left) {
    const pl = packageLines(lines.map(asExtraIfProperty), p.left);
    const items: Shown[] = pl.map((x, i) => {
      const extra = x.qty - x.included;
      return {
        key: lines[i].key,
        qty: x.qty,
        kind: x.minimum ? "flex" : x.included > 0 ? (extra > 0 ? "split" : "included") : "extra",
        amount: rates ? x.amount : null,
        normal: rates && x.unit != null ? x.unit * x.included : null,
        unit: rates ? x.unit : null,
        included: x.included,
        minimum: x.minimum,
      };
    });
    const due = rates ? pl.reduce((n, l) => n + (l.amount ?? 0), 0) : null;
    const used = (k: string) =>
      pl.reduce((n, l, i) => n + (lines[i].key === k ? l.included : 0), 0);
    const after = Object.entries(AFTER_NAME)
      .filter(([k]) => p.left?.[k])
      .map(([k, [one, many]]) => {
        const l = p.left![k];
        const left = Math.max(0, Number(l.remaining) - used(k));
        return `${left} of ${Number(l.qty)} ${Number(l.qty) === 1 ? one : many}`;
      });
    return {
      pkg: true,
      rates,
      items,
      due,
      total: due == null ? null : { label: "Total", value: m(due) },
      after: after.length ? `After this booking: ${after.join(" · ")} left this month` : null,
      m,
    };
  }
  const show = rates && (p.mode === "payg" || p.showAmount);
  const items: Shown[] = lines.map((l) => ({
    key: l.key,
    qty: l.qty,
    kind: "priced",
    amount: show ? l.amount : null,
    normal: null,
    unit: show ? l.unit : null,
    included: 0,
    minimum: l.minimum,
  }));
  const sum = lines.reduce((n, l) => n + (l.amount ?? 0), 0);
  const total =
    !show || !lines.length
      ? null
      : p.mode === "payg"
        ? {
            label: "Total",
            value: sum ? `${lines.some((l) => l.minimum) ? "from " : ""}${m(sum)}` : "On request",
          }
        : sum
          ? { label: "Total", value: `~${m(sum)}` }
          : null;
  return { pkg: false, rates: show, items, total, due: null, after: null, m };
}

/** Short names for the estimate's lines, with a count. */
export function lineName(key: string | undefined, qty: number, fallback = "") {
  const day = (k: string) => (k.includes("full") ? "full" : "half");
  switch (key) {
    case KEY.photos:
      return "Property shoot";
    case KEY.short:
      return `Reels × ${qty}`;
    case KEY.long:
      return `Long-form × ${qty}`;
    case KEY.extra:
      return `Extra minutes × ${qty}`;
    case KEY.min.half:
    case KEY.min.full:
      // Flexible edited: the day minimum, final total after the shoot.
      return day(key) === "half"
        ? "Edited videos, flexible"
        : `Edited videos, flexible · ${DAY_LABEL.full.toLowerCase()}`;
    case KEY.raw.half:
    case KEY.raw.full:
      return `Raw files · ${DAY_LABEL[day(key)].toLowerCase()}`;
    default: {
      // Content shoot v2: "Content shoot · 4h", "Short-form edits × 4", "Long-form edits × 2".
      const h = key?.match(/^content_(\d+)h$/);
      if (h) return `Content shoot · ${h[1]}h`;
      if (key === "content_short_edit") return `Short-form edits × ${qty}`;
      if (key && /^content_long_\d+$/.test(key)) return `Long-form edits × ${qty}`;
      return fallback;
    }
  }
}

const isLongEdit = (k?: string) => !!k && (/^content_long_\d+$/.test(k) || k === "long_form");
/** The raw-files note under a content shoot's line. */
const isShootLine = (k?: string) => !!k && /^content_\d+h$/.test(k);

/** A line's price, wherever it's shown (rows, cards, panel, summary). */
export function PriceTag({ s, v }: { s: Shown | undefined; v: PriceView }) {
  if (!s) return null;
  const { m } = v;
  switch (s.kind) {
    case "priced":
      return s.amount == null ? (
        v.rates ? (
          <span className="bkp-price">On request</span>
        ) : null
      ) : (
        <span className="bkp-price">
          {s.minimum ? "from " : ""}
          {m(s.amount)}
        </span>
      );
    case "flex":
      return <span className="bkp-muted">Included in your package · per finished video</span>;
    case "included":
      return (
        <span className="bkp-inc">
          {s.normal != null && <s className="bkp-muted">{m(s.normal)}</s>}
          <span className="bkp-muted">Included in your package</span>
        </span>
      );
    case "split":
      return (
        <span className="bkp-price">
          {s.included} included · {s.qty - s.included} extra
          {s.unit != null ? ` × ${m(s.unit)}` : ""}
        </span>
      );
    case "extra":
      return s.amount != null ? (
        <span className="bkp-price">{m(s.amount)}</span>
      ) : (
        <span className="bkp-muted">{v.rates ? "On request" : "Extra charges apply"}</span>
      );
  }
}

export type PanelLine = { key?: string; label: string; sub?: string };

/**
 * "Your booking": the lines and the total. Package: "Included in your package" (no amounts), then
 * "Extra charges" with amounts, the extras total and what's left after this booking.
 */
export function BookingPanel({
  lines,
  v,
  empty = "Nothing yet",
  note,
}: {
  lines: PanelLine[];
  v: PriceView;
  empty?: string;
  /** The small grey line under the lines (default: the content shoot's). */
  note?: string;
}) {
  if (!lines.length) return <p className="bkp-muted">{empty}</p>;
  if (!v.pkg) {
    // Long-form edits of different lengths show as one line (display only).
    const rows: { l: PanelLine; s: Shown }[] = [];
    lines.forEach((l, i) => {
      const s = v.items[i];
      const at = isLongEdit(s.key) ? rows.findIndex((r) => isLongEdit(r.s.key)) : -1;
      if (at < 0) return void rows.push({ l, s });
      const r = rows[at].s;
      rows[at] = {
        l: {
          ...rows[at].l,
          label: `Long-form edits × ${r.qty + s.qty}`,
          sub: [rows[at].l.sub, l.sub].filter(Boolean).join(", ") || undefined,
        },
        s: {
          ...r,
          qty: r.qty + s.qty,
          amount: r.amount == null || s.amount == null ? null : r.amount + s.amount,
        },
      };
    });
    const hasEdits =
      !!note || rows.some(({ s }) => s.key === "content_short_edit" || isLongEdit(s.key));
    return (
      <>
        <ul className="bkp-lines">
          {rows.map(({ l, s }, i) => (
            <li key={i}>
              <span>
                {l.label}
                {l.sub && <small className="bkp-muted">{l.sub}</small>}
                {isShootLine(s.key) && <small className="bkp-muted">Raw files included</small>}
              </span>
              <PriceTag s={s} v={v} />
            </li>
          ))}
        </ul>
        {hasEdits && (
          <p className="bkp-muted">
            {note ?? "Short-form up to 60 sec · Long-form up to the length you picked"}
          </p>
        )}
        {v.total && (
          <div className="bkp-total" data-testid="estimate">
            <span>{v.total.label}</span>
            <b>{v.total.value}</b>
          </div>
        )}
      </>
    );
  }
  const inc = v.items
    .map((s, i) => ({ s, l: lines[i] }))
    .filter(({ s }) => s.kind === "flex" || s.included > 0);
  const ext = v.items
    .map((s, i) => ({ s, l: lines[i] }))
    .filter(({ s }) => s.kind !== "flex" && s.qty - s.included > 0);
  return (
    <>
      {inc.length > 0 && (
        <div className="bkp-group">
          <span className="bkp-muted">Included in your package</span>
          <ul className="bkp-lines">
            {inc.map(({ s, l }, i) => (
              <li key={i}>
                <span>
                  {s.kind === "flex" || !s.key || s.key === KEY.photos
                    ? l.label
                    : lineName(s.key, s.included, l.label)}
                  {l.sub && <small className="bkp-muted">{l.sub}</small>}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {ext.length > 0 && (
        <div className="bkp-group">
          <span className="bkp-muted">Extra charges</span>
          <ul className="bkp-lines">
            {ext.map(({ s, l }, i) => (
              <li key={i}>
                <span>
                  {!s.key || s.key === KEY.photos
                    ? l.label
                    : lineName(s.key, s.qty - s.included, l.label)}
                  {l.sub && s.included === 0 && <small className="bkp-muted">{l.sub}</small>}
                </span>
                {s.amount != null ? (
                  <span className="bkp-price">{v.m(s.amount)}</span>
                ) : (
                  !v.rates && <span className="bkp-muted">Extra charges apply</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      {v.total && (
        <div className="bkp-total" data-testid="estimate">
          <span>{v.total.label}</span>
          <b>{v.total.value}</b>
        </div>
      )}
      {v.after && <p className="bkp-muted">{v.after}</p>}
    </>
  );
}
