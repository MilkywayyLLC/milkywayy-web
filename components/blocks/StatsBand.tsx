import type { Stat } from "@/content/types";

/** Big condensed numbers with mono labels, 4 across (2 × 2 on phones). */
export function StatsBand({ stats }: { stats: Stat[] }) {
  if (!stats.length) return null;
  return (
    <div className="stats">
      {stats.map((s) => (
        <div className="stat" key={s.id}>
          <b>{s.value}</b>
          <span>{s.label}</span>
        </div>
      ))}
    </div>
  );
}
