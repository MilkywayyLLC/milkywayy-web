import type { RateCard } from "@/content/types";
import { formatUSD } from "@/lib/format";

/** "Starting from" per-edit rates in USD. No currency switcher, no packages (guide §6.4). */
export function RateCards({
  rates,
  featured = "short",
  snap = false,
}: {
  rates: RateCard[];
  featured?: RateCard["key"];
  /** Phones: a sideways snap row instead of a stacked list. */
  snap?: boolean;
}) {
  return (
    <div className={snap ? "price-grid snap-m" : "price-grid"}>
      {rates.map((r) => (
        <div className={r.key === featured ? "pcard feat" : "pcard"} key={r.key}>
          <span className="nm">{r.name}</span>
          <div className="pr">
            {formatUSD(r.amount)}
            <small>/ {r.unit}</small>
          </div>
          <ul>
            {r.bullets.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
          <span className="fine">Starting from</span>
        </div>
      ))}
    </div>
  );
}
