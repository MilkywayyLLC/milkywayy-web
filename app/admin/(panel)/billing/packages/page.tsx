import { BillingNav } from "@/components/admin/BillingNav";
import { PackageEditor, type PackageRow } from "@/components/admin/BillingTools";
import { portalAdminPage, type ClientListRow } from "@/lib/portal/admin";

export const metadata = { title: "Packages" };

/**
 * Admin → Billing → Packages (§7.3; owner, 3 Oct 2026): monthly packages are private to one
 * client by default (priced individually; no public tiers). Templates (no client) are internal,
 * priced in AED and USD with a 6-month discount, and are what suggestions are made from (owner,
 * 4 Oct 2026). Put a client on a package from their client page.
 */
export default async function Packages() {
  const rpc = await portalAdminPage();
  const [pkgs, clients] = await Promise.all([
    rpc<PackageRow[]>("portal_admin_packages", {}),
    rpc<ClientListRow[]>("portal_admin_clients", {}),
  ]);
  const list = clients
    .map((c) => ({ id: c.id, name: c.name, currency: c.currency }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return (
    <div className="ad-page">
      <div className="ad-head">
        <div>
          <span className="ad-eb">Portal · Billing</span>
          <h1 className="ad-h1">Packages</h1>
          <span className="ad-small ad-muted">
            Private to one client unless you choose “Template”. Inclusions use the same kinds as
            line items, so usage counts itself.
          </span>
        </div>
      </div>
      <BillingNav current="/admin/billing/packages" />
      <h2 className="ad-h2">New package</h2>
      <PackageEditor clients={list} />
      <h2 className="ad-h2" style={{ marginTop: 12 }}>
        Templates (internal, for suggestions)
      </h2>
      {!pkgs.some((p) => !p.account_id) && (
        <p className="ad-empty">
          None yet. Choose “Template” as the client above: priced in AED and USD, never shown as a
          public price list.
        </p>
      )}
      {pkgs
        .filter((p) => !p.account_id)
        .map((p) => (
          <section key={p.id} className="stack" aria-label={p.name}>
            <h3 className="ad-h2" style={{ fontSize: 15 }}>
              {p.name}{" "}
              <span className="ad-small ad-muted">
                · Template{p.suggest ? "" : " (not suggested)"} · {p.clients} on it
              </span>
            </h3>
            <PackageEditor pkg={p} clients={list} />
          </section>
        ))}
      <h2 className="ad-h2" style={{ marginTop: 12 }}>
        Clients’ own packages
      </h2>
      {pkgs
        .filter((p) => p.account_id)
        .map((p) => (
          <section key={p.id} className="stack" aria-label={p.name}>
            <h2 className="ad-h2">
              {p.name}{" "}
              <span className="ad-small ad-muted">
                · {p.account_name ?? "Template"} · {p.clients} on it
              </span>
            </h2>
            <PackageEditor pkg={p} clients={list} />
          </section>
        ))}
    </div>
  );
}
