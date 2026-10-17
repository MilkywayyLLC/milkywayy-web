"use client";

import { money } from "@/lib/portal/billing";
import {
  DAY_LABEL,
  estimateLines,
  KEY,
  packageLines,
  packageLineText,
  type VideoPlan,
} from "@/lib/portal/booking";
import type { RequestConfig } from "@/lib/portal/requests";

/*
 * The booking's price presentation, moved unchanged out of BookingModal (UI rebuild, 17 Oct 2026):
 * what each line and the total say, by who's looking. No price maths lives here.
 */

/** The shown price of a request, by who's looking (shared with the avatar form). */
export function PriceBlock({
  cfg,
  lines,
  total,
}: {
  cfg: RequestConfig;
  lines?: {
    key?: string;
    label: string;
    qty: number;
    amount: number | null;
    minimum?: boolean;
  }[];
  total: number | null;
}) {
  const p = cfg.price;
  if (!p.rates) return null;
  // Package clients: each line Included (what's left this month) or Extra at their price.
  if (p.mode === "package" && p.left && lines?.length) {
    const pl = packageLines(
      lines.map((l) =>
        asExtraIfProperty({
          ...l,
          unit: l.qty ? (l.amount == null ? null : l.amount / l.qty) : null,
        }),
      ),
      p.left,
    );
    const extra = pl.reduce((n, l) => n + (l.amount ?? 0), 0);
    return (
      <div className="pt-estimate" data-testid="estimate">
        <ul className="pt-summary" aria-label="Estimate">
          {pl.map((l, i) => (
            <li key={i}>
              <span>
                {l.label}
                {l.qty > 1 ? ` × ${l.qty}` : ""}
              </span>
              <span className="pt-mono">{packageLineText(l, (n) => money(p.currency, n))}</span>
            </li>
          ))}
        </ul>
        <b>
          {extra > 0
            ? `Extras estimated ${money(p.currency, extra)}, on your month-end invoice.`
            : pl.some((l) => l.qty > l.included)
              ? "Extras are priced on confirmation, on your month-end invoice."
              : "Covered by your monthly package."}
        </b>
      </div>
    );
  }
  if (p.mode !== "payg")
    return (
      <p className="pt-estimate" data-testid="estimate">
        Counts toward your monthly package
        {p.showAmount && total ? ` (estimated ~${money(p.currency, total)})` : ""}.
      </p>
    );
  return (
    <div className="pt-estimate" data-testid="estimate">
      {lines && lines.length > 0 && (
        <ul className="pt-summary" aria-label="Estimate">
          {lines.map((l, i) => (
            <li key={i}>
              <span>
                {l.label}
                {l.qty > 1 ? ` × ${l.qty}` : ""}
              </span>
              <span className="pt-mono">
                {l.amount == null
                  ? "Priced on confirmation"
                  : `${l.minimum ? "at least " : ""}${money(p.currency, l.amount)}`}
              </span>
            </li>
          ))}
        </ul>
      )}
      <b>
        {lines?.some((l) => l.minimum)
          ? `Estimated from ${total ? money(p.currency, total) : "on confirmation"}. Videos are billed per finished video at your rates, or the minimum if that’s higher.`
          : `Estimated ${total ? money(p.currency, total) : "on confirmation"}. The final amount is set after the shoot.`}
      </b>
    </div>
  );
}

/** One line of the live summary: a selected type and what it costs (by who's looking). */
export type SumItem = { label: string; price?: string };

/**
 * The live summary (owner, 17 Oct 2026): one line per selected type, then the total. Prices
 * follow PriceBlock: none without price access; package clients see Included / N extra (a
 * property shoot is always an extra at its price).
 */
export function summarize(
  cfg: RequestConfig,
  lines: ReturnType<typeof estimateLines>,
): { items: SumItem[]; totalText: string | null } {
  const p = cfg.price;
  const m = (n: number) => money(p.currency, n);
  const pkg = p.mode === "package" && !!p.left && !!p.rates;
  const pl = pkg ? packageLines(lines.map(asExtraIfProperty), p.left) : null;
  const items = lines.map((l, i) => ({
    label: `${l.label}${l.qty > 1 ? ` × ${l.qty}` : ""}`,
    price: !p.rates
      ? undefined
      : pl
        ? packageLineText(pl[i], m)
        : p.mode !== "payg"
          ? p.showAmount && l.amount != null
            ? `~${m(l.amount)}`
            : "Counts toward your package"
          : l.amount == null
            ? "Priced on confirmation"
            : `${l.minimum ? "at least " : ""}${m(l.amount)}`,
  }));
  const total = lines.reduce((n, l) => n + (l.amount ?? 0), 0);
  const extras = (pl ?? []).reduce((n, l) => n + (l.amount ?? 0), 0);
  const totalText =
    !p.rates || !items.length
      ? null
      : pl
        ? extras > 0
          ? `${m(extras)} extra`
          : "Included"
        : p.mode === "payg"
          ? total
            ? `${lines.some((l) => l.minimum) ? "from " : ""}${m(total)}`
            : "On confirmation"
          : p.showAmount && total
            ? `~${m(total)}`
            : null;
  return { items, totalText };
}

/** A photo shoot is billed as an extra even on a package (owner, 17 Oct 2026). */
export const asExtraIfProperty = <L extends { key?: string }>(l: L): L =>
  l.key === "shoot" ? { ...l, key: undefined } : l;

/** A package inclusion with something left this month (package clients with price access). */
export function inclusion(cfg: RequestConfig, key: string) {
  if (cfg.price.mode !== "package" || !cfg.price.rates) return null;
  const l = cfg.price.left?.[key];
  return l ? { qty: Number(l.qty), remaining: Math.max(0, Number(l.remaining)) } : null;
}
export const includedText = (i: { qty: number; remaining: number }) =>
  `Included in your package · ${i.remaining} of ${i.qty} left this month`;

export const rateText = (cfg: RequestConfig, key: string, per: string) => {
  const r = cfg.price.rates?.[key];
  return r == null ? null : `${money(cfg.price.currency, Number(r))} ${per}`;
};

/** Under a counter: the price, or what's left on a package and any extras at their own rate. */
export function qtyNote(key: string, qty: number, cfg: RequestConfig, per: string): string | null {
  const inc = inclusion(cfg, key);
  if (!inc) return rateText(cfg, key, per);
  const extra = Math.max(0, qty - inc.remaining);
  if (!extra) return includedText(inc);
  const unit = cfg.price.rates?.[key];
  const amount = unit == null ? "" : ` (${money(cfg.price.currency, Number(unit) * extra)})`;
  return `${includedText(inc)} · ${extra} extra at your rate${amount}`;
}

/** By time: what the day costs, by who's looking. */
export function dayNote(v: VideoPlan, cfg: RequestConfig): string | null {
  const r = cfg.price.rates;
  if (!r) return null;
  const day = v.day === "full" ? "full" : "half";
  const m = (key: string) =>
    r[key] == null ? "on request" : money(cfg.price.currency, Number(r[key]));
  if (v.raw) return `Raw files only: ${m(KEY.raw[day])} for the ${DAY_LABEL[day].toLowerCase()}.`;
  if (cfg.price.mode === "package")
    return "Each finished video draws from your package; anything beyond it is an extra at your rate.";
  return `Billed per finished video at your rates, at least ${m(KEY.min[day])} for the ${DAY_LABEL[day].toLowerCase()}.`;
}
