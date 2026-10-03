import { BillingNav } from "@/components/admin/BillingNav";
import { BillingSettingsForm } from "@/components/admin/BillingTools";
import { portalAdminPage, portalAdminReady } from "@/lib/portal/admin";
import type { BillingSettings } from "@/lib/portal/admin-billing-actions";
import { stripeReady } from "@/lib/stripe";

export const metadata = { title: "Billing settings" };

/** Admin → Billing → Settings (owner, 4 Oct 2026): VAT, bank details, how card payments are set up. */
export default async function BillingSettingsPage() {
  const rpc = await portalAdminPage();
  const s = portalAdminReady()
    ? await rpc<BillingSettings>("portal_admin_billing_settings", {})
    : null;
  return (
    <div className="ad-page">
      <div className="ad-head">
        <div>
          <span className="ad-eb">Portal · Billing</span>
          <h1 className="ad-h1">Settings</h1>
        </div>
      </div>
      <BillingNav current="/admin/billing/settings" />
      {s ? (
        <BillingSettingsForm s={s} />
      ) : (
        <p className="ad-note warn">PORTAL_ADMIN_SECRET isn’t set for this deployment.</p>
      )}
      <section className="ad-card ad-form" aria-label="Card payments">
        <h2 className="ad-h2">Card payments (Stripe)</h2>
        <span className="ad-small">
          {stripeReady()
            ? "Set up: USD clients (and any you switch on) see “Pay now” on unpaid invoices."
            : "Not set up here: add STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET (test keys on previews)."}
        </span>
        <span className="ad-small ad-muted">
          Webhook endpoint: /api/stripe/webhook, events checkout.session.completed and
          checkout.session.async_payment_succeeded. Paid invoices email “Payment received”.
        </span>
      </section>
    </div>
  );
}
