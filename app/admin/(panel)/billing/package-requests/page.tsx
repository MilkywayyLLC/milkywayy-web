import Link from "next/link";
import { LevelsEditor } from "@/components/admin/PackageRequests";
import { Pill } from "@/components/admin/Pill";
import { dubai } from "@/lib/admin/format";
import { portalAdminPage, portalAdminReady } from "@/lib/portal/admin";
import { money } from "@/lib/portal/billing";
import { NEED_LABEL, type PackageLevel, type PackageNeed } from "@/lib/portal/package-builder";

export const metadata = { title: "Package requests" };

type Row = {
  id: string;
  account_id: string;
  account: string;
  currency: string;
  status: "new" | "offered" | "six_requested" | "accepted" | "closed";
  needs: PackageNeed[];
  volume: { short: number; long: number; long_minutes: number | null; property: number };
  payment_pref: "upfront" | "usage";
  six_months: boolean;
  scripting: boolean;
  created_at: string;
  price: number | null;
};

const STATUS: Record<Row["status"], [string, "accent" | "info" | "ok" | "neutral" | "warn"]> = {
  new: ["New", "accent"],
  offered: ["Offer sent", "info"],
  six_requested: ["6 months to confirm", "accent"],
  accepted: ["Accepted", "ok"],
  closed: ["Closed", "neutral"],
};

/**
 * Admin → Money → Package requests (owner, 28 Oct 2026): clients asking for a monthly package (and
 * 6-month plans to confirm), newest first; each opens the builder. The discount levels sit below.
 */
export default async function PackageRequestsPage() {
  const rpc = await portalAdminPage();
  const ready = portalAdminReady();
  const [rows, settings] = ready
    ? await Promise.all([
        rpc<Row[]>("portal_admin_package_requests", { p_status: null }),
        rpc<{ package_levels: PackageLevel[]; six_month_pct: number }>(
          "portal_admin_billing_settings",
          {},
        ),
      ])
    : [[], null];
  const open = rows.filter((r) => r.status === "new" || r.status === "six_requested");
  return (
    <div className="ad-page">
      <div className="ad-head">
        <div>
          <span className="ad-eb">Money</span>
          <h1 className="ad-h1">Package requests</h1>
          <span className="ad-small ad-muted">
            {open.length ? `${open.length} waiting on you.` : "Nothing waiting."}
          </span>
        </div>
      </div>
      <section className="ad-card">
        {rows.length ? (
          <div className="ad-scroll">
            <table className="ad-table" aria-label="Package requests">
              <thead>
                <tr>
                  <th>Client</th>
                  <th>Needs</th>
                  <th>Per month</th>
                  <th>Pays</th>
                  <th>Offer</th>
                  <th>Status</th>
                  <th>Asked</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <Link href={`/admin/billing/package-requests/${r.id}`}>{r.account}</Link>
                    </td>
                    <td>
                      {r.needs.map((n) => NEED_LABEL[n]).join(", ")}
                      {r.scripting && (
                        <div className="ad-small ad-muted">+ scripting / strategy</div>
                      )}
                    </td>
                    <td className="ad-small">
                      {r.volume.short} short · {r.volume.long} long · {r.volume.property} property
                    </td>
                    <td className="ad-small">
                      {r.payment_pref === "upfront" ? "Upfront" : "What they use"}
                      {r.six_months ? " · 6 mo?" : ""}
                    </td>
                    <td className="ad-mono">
                      {r.price != null ? money(r.currency, Number(r.price)) : "—"}
                    </td>
                    <td>
                      <Pill tone={STATUS[r.status][1]}>{STATUS[r.status][0]}</Pill>
                    </td>
                    <td className="ad-small ad-muted">{dubai(r.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="ad-small ad-muted">
            No requests yet. Clients ask from Billing → “Build a monthly package”.
          </p>
        )}
      </section>
      {settings && (
        <LevelsEditor
          levels={settings.package_levels}
          sixMonthPct={Number(settings.six_month_pct)}
        />
      )}
    </div>
  );
}
