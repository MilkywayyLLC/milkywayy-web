import Link from "next/link";
import { dubai } from "@/lib/admin/format";
import { portalAdminPage, portalAdminReady, type ClientListRow } from "@/lib/portal/admin";
import { industryLabel, SERVICES, serviceLabel } from "@/lib/portal/options";

export const metadata = { title: "Client accounts" };

type Props = { searchParams: Promise<{ q?: string; service?: string; type?: string }> };

/** Portal client accounts (§7.1), newest activity first. Owner only. Filters are a plain GET form. */
export default async function Accounts({ searchParams }: Props) {
  const rpc = await portalAdminPage();
  const f = await searchParams;
  let rows: ClientListRow[] = [];
  let error = "";
  if (!portalAdminReady()) error = "PORTAL_ADMIN_SECRET isn’t set for this deployment.";
  else
    try {
      rows = await rpc<ClientListRow[]>("portal_admin_clients", {
        p_q: f.q || null,
        p_service: f.service || null,
        p_type: f.type || null,
      });
    } catch (e) {
      error = e instanceof Error ? e.message : "Couldn’t load clients.";
    }
  const filtered = !!(f.q || f.service || f.type);

  return (
    <div className="ad-page">
      <div className="ad-head">
        <div>
          <span className="ad-eb">Portal</span>
          <h1 className="ad-h1">Client accounts</h1>
        </div>
        <Link className="ad-btn" href="/admin/accounts/new" prefetch={false}>
          New client
        </Link>
      </div>
      <form className="ad-filter" method="get" role="search">
        <input
          type="search"
          name="q"
          defaultValue={f.q}
          placeholder="Name, email or phone"
          aria-label="Search clients"
          style={{ flex: "1 1 220px", width: "auto" }}
        />
        <select name="service" defaultValue={f.service ?? ""} aria-label="Service">
          <option value="">All services</option>
          {SERVICES.map(([k, l]) => (
            <option key={k} value={k}>
              {l}
            </option>
          ))}
        </select>
        <select name="type" defaultValue={f.type ?? ""} aria-label="Type">
          <option value="">Companies and individuals</option>
          <option value="company">Companies</option>
          <option value="individual">Individuals</option>
        </select>
        <button className="ad-btn small" type="submit">
          Filter
        </button>
        {filtered && (
          <Link className="ad-btn quiet small" href="/admin/accounts" prefetch={false}>
            Clear
          </Link>
        )}
      </form>
      {error && <p className="ad-note warn">{error}</p>}
      <div className="ad-list" data-testid="accounts">
        {rows.map((r) => (
          <Link
            key={r.id}
            href={`/admin/accounts/${r.id}`}
            className="ad-row ad-lead"
            prefetch={false}
          >
            <span className="ad-pill draft">{r.type === "company" ? "Company" : "Individual"}</span>
            <span className="ad-row-main">
              <span>
                <span className="ad-row-title">{r.name}</span>
                <span className="ad-row-meta" style={{ display: "block" }}>
                  {[
                    r.type === "company" ? industryLabel(r.industry, r.industry_other) : null,
                    r.services_interest.map(serviceLabel).join(", ") || "No services chosen",
                    `${r.members} member${r.members === 1 ? "" : "s"}`,
                    r.open_invites
                      ? `${r.open_invites} invite${r.open_invites === 1 ? "" : "s"} open`
                      : null,
                    r.bookings ? `${r.bookings} booking${r.bookings === 1 ? "" : "s"}` : null,
                    r.currency,
                    `active ${dubai(r.last_activity)}`,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </span>
            </span>
            <span aria-hidden="true">›</span>
          </Link>
        ))}
        {!rows.length && !error && (
          <p className="ad-empty">
            {filtered
              ? "No clients match these filters."
              : "No client accounts yet. They appear when clients sign up, or create one here."}
          </p>
        )}
      </div>
    </div>
  );
}
