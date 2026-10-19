import Link from "next/link";
import { BillingNav } from "@/components/admin/BillingNav";
import { SuggestionMinimums, SuggestionsSwitch } from "@/components/admin/BillingTools";
import { portalAdminPage } from "@/lib/portal/admin";

export const metadata = { title: "Suggestions" };

/**
 * Admin → Billing → Suggestions (owner, 4 Oct 2026): pay-as-you-go clients see the best package
 * when it would save them at least the minimum. Built from the template packages (or an offer
 * pinned on the client's page), on their last 3 complete months with work in at least 2: price +
 * overage beyond the inclusions + their own rates for anything not covered.
 */
export default async function Suggestions() {
  const rpc = await portalAdminPage();
  const s = await rpc<{
    enabled: boolean;
    min_saving_aed: number;
    min_saving_usd: number;
    templates: number;
  }>("portal_admin_suggestions", {});
  return (
    <div className="ad-page">
      <div className="ad-head">
        <div>
          <span className="ad-eb">Portal · Billing</span>
          <h1 className="ad-h1">Suggestions</h1>
          <span className="ad-small ad-muted">
            A card in the client’s Billing: the package, what it includes, the monthly and 6-month
            price and saving, and “Talk to us”. No self-checkout: you put them on it after the call.
          </span>
        </div>
      </div>
      <BillingNav current="/admin/billing/suggestions" />
      <section className="ad-card ad-form" aria-label="Global switch">
        <SuggestionsSwitch enabled={s.enabled} />
        <span className="ad-small ad-muted">
          {s.enabled
            ? "On: pay-as-you-go clients see the best package when it saves them at least the minimum."
            : "Off: no client sees a suggestion."}
        </span>
        <SuggestionMinimums aed={Number(s.min_saving_aed)} usd={Number(s.min_saving_usd)} />
      </section>
      <section className="ad-card ad-form" aria-label="How it works">
        <h2 className="ad-h2">How it’s worked out</h2>
        <ul className="ad-small" style={{ margin: 0, paddingLeft: 18 }}>
          <li>
            Basis: the average of the last 3 complete months (never the current one), only if the
            client had work in at least 2 of them.
          </li>
          <li>
            For each template ({Number(s.templates)} in use) or the client’s pinned offer: the
            package price + overage for usage beyond its inclusions + the client’s own rates for
            anything it doesn’t cover. Saving = their average − that.
          </li>
          <li>The best one shows if the saving is at least the minimum above.</li>
          <li>
            Each client page shows what the engine would suggest, and why it is or isn’t shown.
          </li>
        </ul>
        <Link className="ad-small" href="/admin/billing/packages" prefetch={false}>
          Templates are on the Packages page →
        </Link>
      </section>
    </div>
  );
}
