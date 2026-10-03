import Link from "next/link";
import { ShareSwitch } from "@/components/admin/ShareTools";
import { portalAdminPage, portalAdminReady } from "@/lib/portal/admin";

export const metadata = { title: "Listings" };

type Row = {
  kind: "l" | "c";
  id: string;
  account_id: string;
  account_name: string;
  slug: string;
  title: string;
  state: "live" | "paused" | "expired" | "disabled";
  expires_on: string | null;
  disabled_reason: string | null;
  project_ref: string | null;
  views: number;
  taps: number;
  reports: number;
  last_report: string | null;
  created_at: string;
};
type Props = { searchParams: Promise<{ q?: string; filter?: string; account?: string }> };

const PILL = {
  live: "ad-pill live",
  paused: "ad-pill",
  expired: "ad-pill",
  disabled: "ad-pill warn",
};
const LABEL = { live: "Live", paused: "Paused", expired: "Expired", disabled: "Turned off" };
const FILTERS = [
  ["all", "All"],
  ["live", "Live"],
  ["reported", "Reported"],
  ["disabled", "Turned off"],
] as const;

/**
 * Admin → Listings (§7.4): every share page and collection, with views and taps, a Reported
 * filter, and a switch to turn any page off (abuse or takedown), with a reason the client sees.
 */
export default async function AdminListings({ searchParams }: Props) {
  const rpc = await portalAdminPage();
  const f = await searchParams;
  const filter = FILTERS.some(([k]) => k === f.filter) ? f.filter! : "all";
  let rows: Row[] = [];
  let error = "";
  if (!portalAdminReady()) error = "PORTAL_ADMIN_SECRET isn’t set for this deployment.";
  else
    rows = await rpc<Row[]>("portal_admin_shares", {
      p_q: f.q || null,
      p_filter: filter,
      p_account: /^[0-9a-f-]{36}$/.test(f.account ?? "") ? f.account : null,
    });
  const qs = (k: string) =>
    `/admin/listings?${new URLSearchParams({ ...(f.q ? { q: f.q } : {}), ...(f.account ? { account: f.account } : {}), filter: k })}`;

  return (
    <div className="ad-page">
      <div className="ad-head">
        <div>
          <span className="ad-eb">Portal</span>
          <h1 className="ad-h1">Listings</h1>
          <span className="ad-small ad-muted">
            Clients’ share pages (/l/) and collections (/c/). Views and taps exclude bots.
          </span>
        </div>
      </div>
      {error && <p className="ad-note warn">{error}</p>}
      <nav className="ad-btns" aria-label="Filter">
        {FILTERS.map(([k, l]) => (
          <Link
            key={k}
            href={qs(k)}
            prefetch={false}
            className={k === filter ? "ad-btn small" : "ad-btn quiet small"}
            aria-current={k === filter ? "page" : undefined}
          >
            {l}
          </Link>
        ))}
      </nav>
      <form className="ad-filter" method="get" role="search">
        <input
          name="q"
          defaultValue={f.q ?? ""}
          placeholder="Title, link or client"
          aria-label="Search"
        />
        <input type="hidden" name="filter" value={filter} />
        <button className="ad-btn small" type="submit">
          Search
        </button>
      </form>
      <div className="ad-list" data-testid="shares">
        {rows.map((r) => (
          <div
            key={r.id}
            className="ad-row ad-lead"
            style={{ gridTemplateColumns: "auto minmax(0,1fr)", alignItems: "start" }}
            role="group"
            aria-label={r.title}
          >
            <span className={PILL[r.state]}>{LABEL[r.state]}</span>
            <span style={{ display: "grid", gap: 6, minWidth: 0 }}>
              <span className="ad-row-title">
                {r.kind === "c" ? "Collection: " : ""}
                {r.title} · {r.account_name}
              </span>
              <span className="ad-row-meta">
                <a href={`/${r.kind}/${r.slug}`} target="_blank" rel="noopener">
                  /{r.kind}/{r.slug}
                </a>
                {r.project_ref ? ` · ${r.project_ref}` : ""} · {r.views} views · {r.taps} taps
                {r.expires_on ? ` · expires ${r.expires_on}` : ""}
              </span>
              {r.state === "disabled" && r.disabled_reason && (
                <span className="ad-row-meta">Reason: {r.disabled_reason}</span>
              )}
              {r.reports > 0 && (
                <span className="ad-note warn" style={{ margin: 0 }}>
                  {r.reports} report{r.reports === 1 ? "" : "s"}: “{r.last_report}”
                </span>
              )}
              <ShareSwitch
                kind={r.kind}
                id={r.id}
                title={r.title}
                disabled={r.state === "disabled"}
                reports={r.reports}
              />
            </span>
          </div>
        ))}
        {!rows.length && !error && (
          <p className="ad-empty">No share pages{filter !== "all" || f.q ? " match" : " yet"}.</p>
        )}
      </div>
    </div>
  );
}
