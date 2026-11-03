import type { RateCard } from "@/content/types";
import { formatUSD } from "@/lib/format";

/**
 * "Starting from" per-edit rates in USD (owner, 3 Nov 2026). No currency switcher, no packages
 * (guide §6.4). A rate without an amount is left out: a price card always shows a number.
 */
export function RateCards({
  rates,
  featured = "short",
}: {
  rates: RateCard[];
  featured?: RateCard["key"];
}) {
  return (
    <div className="price-grid">
      {rates
        .filter((r) => Number(r.amount) > 0)
        .map((r) => (
          <div className={r.key === featured ? "pcard feat" : "pcard"} key={r.key}>
            <span className="nm">{r.name}</span>
            <span className="fine">Starting from</span>
            <div className="pr">
              {formatUSD(r.amount)}
              <small>/ {r.unit}</small>
            </div>
            <ul>
              {r.bullets.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
          </div>
        ))}
    </div>
  );
}
