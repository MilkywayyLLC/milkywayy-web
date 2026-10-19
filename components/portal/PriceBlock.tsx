"use client";

import { money } from "@/lib/portal/billing";
import { packageLines, packageLineText } from "@/lib/portal/booking";
import type { RequestConfig } from "@/lib/portal/requests";

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

/** A photo shoot is billed as an extra even on a package (owner, 17 Oct 2026). */
const asExtraIfProperty = <L extends { key?: string }>(l: L): L =>
  l.key === "shoot" ? { ...l, key: undefined } : l;
