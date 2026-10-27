import { BackfillInvoices } from "@/components/admin/BackfillInvoices";
import { TurnaroundForm } from "@/components/admin/TurnaroundForm";
import { portalAdminPage, portalAdminReady } from "@/lib/portal/admin";
import type { TurnaroundRow } from "@/lib/portal/admin-billing-actions";

export const metadata = { title: "Operations" };

/** Settings → Operations (admin redesign, 27 Oct 2026): turnaround times and the invoice backfill,
 *  moved from Billing settings. Same components, same actions. */
export default async function Operations() {
  const rpc = await portalAdminPage();
  const ready = portalAdminReady();
  const turnaround = ready ? await rpc<TurnaroundRow[]>("portal_admin_turnaround", {}) : [];
  return (
    <div className="ad-page">
      <div className="ad-head">
        <div>
          <span className="ad-eb">Settings</span>
          <h1 className="ad-h1">Operations</h1>
        </div>
      </div>
      {!ready && <p className="ad-note warn">Portal sections are locked on this deployment.</p>}
      {turnaround.length > 0 && <TurnaroundForm rows={turnaround} />}
      {ready && <BackfillInvoices />}
    </div>
  );
}
