import { BillingSettingsForm } from "@/components/admin/BillingTools";
import { PaymentSettingsForm, type PaymentSettings } from "@/components/admin/PaymentAdmin";
import { portalAdminPage, portalAdminReady } from "@/lib/portal/admin";
import type { BillingSettings } from "@/lib/portal/admin-billing-actions";
import { stripeReady } from "@/lib/stripe";

export const metadata = { title: "Billing settings" };

/** Admin → Settings → Business & billing (owner, 4 Oct 2026; moved 27 Oct): VAT, bank details, how card payments are set up. */
export default async function BillingSettingsPage() {
  const rpc = await portalAdminPage();
  const s = portalAdminReady()
    ? await rpc<BillingSettings>("portal_admin_billing_settings", {})
    : null;
  return (
    <div className="ad-page">
      <div className="ad-head">
        <div>
          <span className="ad-eb">Settings</span>
          <h1 className="ad-h1">Business &amp; billing</h1>
        </div>
      </div>
      {s ? (
        <>
          <BillingSettingsForm s={s} />
          <PaymentSettingsForm s={s as unknown as PaymentSettings} />
        </>
      ) : (
        <p className="ad-note warn">PORTAL_ADMIN_SECRET isn’t set for this deployment.</p>
      )}
      <section className="ad-card ad-form" aria-label="Card payments">
        <h2 className="ad-h2">Card payments (Stripe)</h2>
        <span className="ad-small">
          {stripeReady()
            ? "Set up: every client sees “Pay now” on open invoices (checkout on our site), can save a card and opt in to automatic month-end payments."
            : "Not set up here: add STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET (test keys on previews)."}
        </span>
        <span className="ad-small ad-muted">
          Webhook endpoint: /api/stripe/webhook (events and keys: docs/STRIPE_SETUP.md). Paid
          invoices email “Payment received”; a paid booking waits as “Pending confirmation” until
          you confirm it or propose another time.
        </span>
      </section>
    </div>
  );
}
