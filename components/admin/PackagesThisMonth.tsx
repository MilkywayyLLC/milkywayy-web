import Link from "next/link";
import type { ValueMonth } from "@/components/portal/PaymentParts";
import { money } from "@/lib/portal/billing";
import { BILLING_LABEL, monthMode, nextInvoice, planTitle } from "@/lib/portal/plan";
import { creditLabel } from "@/lib/portal/rollover";
import { dayLabel } from "@/lib/portal/when";

export type PlanSummaryRow = { account_id: string; account: string; plan: ValueMonth };

/**
 * Every package client's month, from portal_admin_plan_summaries: the same summary the client's
 * Billing page and the admin client page read, so Today, Invoices and the client agree (28 Oct 2026).
 */
export function PackagesThisMonth({ rows }: { rows: PlanSummaryRow[] | null }) {
  if (!rows?.length) return null;
  return (
    <section className="ad-card" aria-label="Packages this month" data-testid="packages-month">
      <h2 className="ad-h2">Packages this month</h2>
      <div className="ad-list">
        {rows.map(({ account_id, account, plan: v }) => {
          const m = (n: number) => money(v.currency, Number(n));
          const next = nextInvoice(v);
          const carried = v.carry && Number(v.carry.allowance) + Number(v.carry.half_days) > 0;
          return (
            <Link
              key={account_id}
              href={`/admin/accounts/${account_id}?tab=billing`}
              className="ad-row ad-today-row"
              prefetch={false}
              data-testid="packages-month-row"
            >
              <span className="ad-row-main">
                <span>
                  <span className="ad-row-title">
                    {account} · {planTitle(v)}
                  </span>
                  <span className="ad-row-meta ad-block">
                    {BILLING_LABEL[monthMode(v)]} · {m(v.used)} of {m(v.allowance)} used ·{" "}
                    {v.half_days_used} of {v.half_day_cap} half days
                    {carried &&
                      ` · ${creditLabel(v.currency, v.carry!.allowance, v.carry!.half_days)} carried`}
                  </span>
                </span>
              </span>
              <span className="ad-small" data-testid="packages-month-next">
                Next invoice {dayLabel(next.on)} · {m(next.amount)}
                {monthMode(v) === "usage" ? " so far" : ""}
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
