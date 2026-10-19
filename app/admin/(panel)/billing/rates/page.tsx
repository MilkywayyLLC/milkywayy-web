import { BillingNav } from "@/components/admin/BillingNav";
import { RateCardRow, type RateRow } from "@/components/admin/BillingTools";
import { portalAdminPage } from "@/lib/portal/admin";

export const metadata = { title: "Rate card" };

/**
 * Admin → Billing → Rate card (§7.3): unit rates per currency. A client's own rates (overrides)
 * are on their client page. Line items use the client's rate unless a price is entered.
 */
export default async function Rates() {
  const rpc = await portalAdminPage();
  const rows = await rpc<RateRow[]>("portal_admin_rate_card", {});
  return (
    <div className="ad-page">
      <div className="ad-head">
        <div>
          <span className="ad-eb">Portal · Billing</span>
          <h1 className="ad-h1">Rate card</h1>
          <span className="ad-small ad-muted">
            AED for UAE clients, USD for overseas (each client’s currency is on their page). Empty =
            priced per job.
          </span>
        </div>
      </div>
      <BillingNav current="/admin/billing/rates" />
      <section className="ad-card" data-testid="rate-card">
        {rows.map((r) => (
          <RateCardRow key={r.key} row={r} />
        ))}
        <RateCardRow />
      </section>
    </div>
  );
}
