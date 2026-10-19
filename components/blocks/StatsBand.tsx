import type { Stat } from "@/content/types";
import { StatValue } from "./StatValue";

/**
 * Big condensed numbers with mono labels, 4 across (2 × 2 on phones). Numbers count up once when
 * the band scrolls into view (StatValue); a year fades in instead.
 * Every number must be confirmed before launch: LAUNCH.statsConfirmed (content/launch.ts) gates
 * the production build.
 */
export function StatsBand({ stats }: { stats: Stat[] }) {
  if (!stats.length) return null;
  return (
    <div className="stats">
      {stats.map((s) => (
        <div className="stat" key={s.id}>
          <StatValue value={s.value} />
          <span>{s.label}</span>
        </div>
      ))}
    </div>
  );
}
