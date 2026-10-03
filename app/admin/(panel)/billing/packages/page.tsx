import { BillingNav } from "@/components/admin/BillingNav";
import { PackageEditor, type PackageRow } from "@/components/admin/BillingTools";
import { portalAdminPage, type ClientListRow } from "@/lib/portal/admin";

export const metadata = { title: "Packages" };

/**
 * Admin → Billing → Packages (§7.3; owner, 3 Oct 2026): monthly packages are private to one
 * client by default (priced individually; no public tiers). Template packages (no client) are for
 * suggestions. Put a client on a package from their client page.
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
      {pkgs.map((p) => (
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
