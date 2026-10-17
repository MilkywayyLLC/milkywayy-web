import { Icon } from "../Icon";

export type Stat = { icon: string; value: string; label: string };

/**
 * Home's four tiles (UI rebuild, 17 Oct 2026): Upcoming, In editing, Ready to download and, only
 * for those who see prices, Spent this month or Package used. Counts come from the bookings Home
 * already loads; the fourth from the same `my_billing` the Billing page reads.
 */
export function StatTiles({ stats }: { stats: Stat[] }) {
  return (
    <ul className="pt-hm-stats" aria-label="At a glance" data-testid="stats">
      {stats.map((s) => (
        <li key={s.label}>
          <span className="pt-hm-stat-ic" aria-hidden="true">
            <Icon name={s.icon} size={20} />
          </span>
          <b className="pt-hm-stat-v">{s.value}</b>
          <span className="pt-meta">{s.label}</span>
        </li>
      ))}
    </ul>
  );
}
