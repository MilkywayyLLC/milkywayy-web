import { RefundsTable, type RefundListRow } from "@/components/admin/PaymentAdmin";
import { portalAdminPage, portalAdminReady } from "@/lib/portal/admin";

export const metadata = { title: "Refunds" };

/**
 * Admin → Billing → Refunds (payment terms, 24 Oct 2026): every refund from a cancellation. Card
 * payments go back through Stripe on their own; bank and Wio ones are "Refund due" until you send
 * the money and tick them off.
 */
export default async function RefundsPage() {
  const rpc = await portalAdminPage();
  const rows = portalAdminReady() ? await rpc<RefundListRow[]>("portal_admin_refunds", {}) : [];
  const due = rows.filter((r) => r.status === "due");
  const sorted = [...due, ...rows.filter((r) => r.status !== "due")];
  return (
    <div className="ad-page">
      <div className="ad-head">
        <div>
          <span className="ad-eb">Money</span>
          <h1 className="ad-h1">Refunds</h1>
          <span className="ad-small ad-muted">
            {due.length
              ? `${due.length} refund${due.length === 1 ? "" : "s"} due by bank transfer or Wio.`
              : "Nothing to send."}
          </span>
        </div>
      </div>
      <section className="ad-card">
        <RefundsTable rows={sorted} />
      </section>
    </div>
  );
}
