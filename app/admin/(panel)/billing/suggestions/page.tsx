import { BillingNav } from "@/components/admin/BillingNav";
import {
  RuleEditor,
  SuggestionsSwitch,
  type PackageRow,
  type RuleRow,
} from "@/components/admin/BillingTools";
import { portalAdminPage } from "@/lib/portal/admin";

export const metadata = { title: "Suggestions" };

/**
 * Admin → Billing → Suggestions (§7.3): when to suggest a package to a pay-as-you-go client. Off
 * for everyone until switched on here (owner, 3 Oct 2026); each client can also be excluded.
 */
export default async function Suggestions() {
  const rpc = await portalAdminPage();
  const [s, pkgs] = await Promise.all([
    rpc<{ enabled: boolean; rules: RuleRow[] }>("portal_admin_suggestions", {}),
    rpc<PackageRow[]>("portal_admin_packages", {}),
  ]);
  const options = pkgs.map((p) => ({
    id: p.id,
    name: `${p.name}${p.account_name ? ` (${p.account_name})` : ""}`,
    price: p.monthly_price,
    currency: p.currency,
  }));
  return (
    <div className="ad-page">
      <div className="ad-head">
        <div>
          <span className="ad-eb">Portal · Billing</span>
          <h1 className="ad-h1">Suggestions</h1>
          <span className="ad-small ad-muted">
            A card in the client’s Billing: “At your volume, Growth would save you about AED 1,150 a
            month. Talk to us →”.
          </span>
        </div>
      </div>
      <BillingNav current="/admin/billing/suggestions" />
      <section className="ad-card ad-form" aria-label="Global switch">
        <SuggestionsSwitch enabled={s.enabled} />
        <span className="ad-small ad-muted">
          {s.enabled
            ? "On: clients who match a rule see the card."
            : "Off: no client sees a suggestion, whatever the rules say."}
        </span>
      </section>
      {s.rules.map((r) => (
        <RuleEditor key={r.id} rule={r} packages={options} />
      ))}
      <RuleEditor packages={options} />
    </div>
  );
}
