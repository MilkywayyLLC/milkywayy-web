import {
  budgetPct,
  dateLabel,
  money,
  monthLabel,
  producedSummary,
  type ActivityRow,
  type BudgetMonth,
} from "@/lib/portal/billing";

/**
 * A budget package's month (owner, 10 Oct 2026). "This month" is what was produced at the
 * client's own rates; the bar fills toward the monthly package and stays full beyond it, with the
 * higher total simply shown. Neutral on purpose: no "over", "exceeded" or "limit", no warning
 * colour. Owner/Admins only (the database refuses Members).
 */
export function BudgetCard({ b, currency }: { b: BudgetMonth; currency: string }) {
  const pct = budgetPct(Number(b.total), b.budget);
  return (
    <section className="pt-card pt-budget" aria-labelledby="budget-h" data-testid="budget">
      <span className="pt-eb">{monthLabel(b.month)}</span>
      <h2 id="budget-h" className="pt-budget-now">
        This month: <b data-testid="budget-total">{money(currency, Number(b.total))}</b>
      </h2>
      {b.budget != null && (
        <span className="pt-meta" data-testid="budget-amount">
          Monthly package: {money(currency, Number(b.budget))}
        </span>
      )}
      <span
        className="pt-budget-bar"
        role="meter"
        aria-label="This month against your monthly package"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        data-testid="budget-bar"
      >
        <i style={{ width: `${pct}%` }} />
      </span>
    </section>
  );
}

/** Newest first: date · shoot · what was produced · amount; each opens to its line items. */
export function ActivityList({ rows, currency }: { rows: ActivityRow[]; currency: string }) {
  return (
    <section className="pt-card" aria-labelledby="activity-h" data-testid="activity">
      <h2 id="activity-h" className="pt-h2">
        Activity
      </h2>
      {rows.length === 0 ? (
        <p className="pt-meta" style={{ margin: 0 }}>
          Nothing logged this month yet. Each shoot shows here once we’ve logged what we shot.
        </p>
      ) : (
        <ul className="pt-activity">
          {rows.map((r) => (
            <li key={r.project_id ?? "other"}>
              <details>
                <summary>
                  <span className="pt-act-date">{dateLabel(r.date, { year: undefined })}</span>
                  <span className="pt-act-what">
                    <b>{r.location ? r.location.split(",")[0] : (r.title ?? "Other work")}</b>
                    <span className="pt-meta">{producedSummary(r.items)}</span>
                  </span>
                  <span className="pt-mono pt-act-amt">{money(currency, Number(r.total))}</span>
                </summary>
                <ul className="pt-lines">
                  {r.items.map((i, n) => (
                    <li key={n}>
                      <span>
                        {i.description}
                        {Number(i.qty) !== 1 &&
                          ` · ${Number(i.qty)} × ${money(currency, Number(i.unit_price))}`}
                      </span>
                      <span className="pt-mono">{money(currency, Number(i.amount))}</span>
                    </li>
                  ))}
                </ul>
              </details>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
