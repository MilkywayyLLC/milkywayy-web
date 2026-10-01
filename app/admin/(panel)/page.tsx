import Link from "next/link";
import { RefreshSite } from "@/components/admin/RefreshSite";
import { requireAdmin, TEST_ACCOUNTS } from "@/lib/admin/auth";
import { dubai } from "@/lib/admin/format";

export const metadata = { title: "Dashboard" };

const preview = (p: string) => `/admin/preview?path=${encodeURIComponent(p)}`;
const daysAgo = (n: number) => new Date(Date.now() - n * 864e5).toISOString();

export default async function Dashboard({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const { db, role } = await requireAdmin();
  const params = await searchParams;
  const weekAgo = daysAgo(7);
  const [changes, leadsWeek, latest, drafts] = await Promise.all([
    db
      .from("change_log")
      .select("at, admin_email, summary")
      .not("admin_email", "like", TEST_ACCOUNTS)
      .order("at", { ascending: false })
      .limit(12),
    role === "owner"
      ? db.from("leads").select("id", { count: "exact", head: true }).gte("created_at", weekAgo)
      : null,
    role === "owner"
      ? db
          .from("leads")
          .select("ref, type, name, created_at, status")
          .order("created_at", { ascending: false })
          .limit(5)
      : null,
    db.from("drafts").select("key, updated_at"),
  ]);
  const DRAFT_LINKS: Record<string, [string, string]> = {
    pricing_property: ["Property shoot prices", "/admin/pricing"],
    pricing_other: ["Other prices", "/admin/pricing/other"],
    site: ["Site settings", "/admin/settings"],
    avatar_hero: ["AI avatars hero", "/admin/avatar-hero"],
  };

  return (
    <div className="ad-page">
      <div className="ad-head">
        <div>
          <span className="ad-eb">Workspace</span>
          <h1 className="ad-h1">Dashboard</h1>
        </div>
        <a className="ad-btn ghost" href={preview("/")} target="_blank" rel="noopener">
          Preview the site
        </a>
      </div>
      {params["owner-only"] && <p className="ad-note warn">That section is for the Owner.</p>}
      {!!drafts.data?.length && (
        <div className="ad-note">
          Unpublished drafts:{" "}
          {drafts.data.map((d, i) => (
            <span key={d.key}>
              {i > 0 && " · "}
              <Link href={DRAFT_LINKS[d.key][1]}>{DRAFT_LINKS[d.key][0]}</Link>
            </span>
          ))}
        </div>
      )}

      {role === "owner" && (
        <div className="ad-stats">
          <div className="ad-stat">
            <span className="ad-eb">New leads this week</span>
            <b>{leadsWeek?.count ?? 0}</b>
          </div>
        </div>
      )}

      <div className="ad-grid2">
        {role === "owner" && (
          <section className="ad-card" aria-label="Latest leads">
            <h2 className="ad-h2">Latest leads</h2>
            {latest?.data?.length ? (
              latest.data.map((l) => (
                <Link key={l.ref} href="/admin/leads" className="ad-row-main">
                  <div>
                    <div className="ad-row-title">
                      {l.name || "No name"} · {l.type}
                    </div>
                    <div className="ad-row-meta">
                      {l.ref} · {dubai(l.created_at)} · {l.status}
                    </div>
                  </div>
                </Link>
              ))
            ) : (
              <p className="ad-muted ad-small">
                No leads yet. Form and booking requests land here once the forms are connected.
              </p>
            )}
          </section>
        )}
        <section className="ad-card" aria-label="Recent changes">
          <h2 className="ad-h2">Recent changes</h2>
          {changes.data?.length ? (
            <ul style={{ display: "grid", gap: 10, listStyle: "none", padding: 0, margin: 0 }}>
              {changes.data.map((c, i) => (
                <li key={i} className="ad-small">
                  <b>{c.summary}</b>
                  <br />
                  <span className="ad-muted">
                    {dubai(c.at)} · {c.admin_email}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="ad-muted ad-small">Nothing changed yet.</p>
          )}
        </section>
      </div>

      <section className="ad-card" aria-label="Quick links">
        <h2 className="ad-h2">Quick links</h2>
        <div className="ad-btns">
          <Link className="ad-btn ghost small" href="/admin/portfolio/new">
            Add portfolio item
          </Link>
          <Link className="ad-btn ghost small" href="/admin/faqs">
            FAQs
          </Link>
          <Link className="ad-btn ghost small" href="/admin/reviews/new">
            Add a review
          </Link>
          {role === "owner" && (
            <Link className="ad-btn ghost small" href="/admin/pricing">
              Prices
            </Link>
          )}
        </div>
        <RefreshSite />
      </section>
    </div>
  );
}
