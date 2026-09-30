import type { RateCard } from "@/content/types";
import { formatUSD } from "@/lib/format";

/** "Starting from" per-edit rates in USD. No currency switcher, no packages (guide §6.4). */
export function RateCards({
  rates,
  featured = "short",
}: {
  rates: RateCard[];
  featured?: RateCard["key"];
}) {
  return (
    <div className="price-grid">
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
