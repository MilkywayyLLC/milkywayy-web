import { headers } from "next/headers";
import Link from "next/link";
import { StatusButtons } from "@/components/admin/ProjectStatus";
import { portalAdminPage, portalAdminReady, type ProjectListRow } from "@/lib/portal/admin";
import { originFrom } from "@/lib/portal/invite";
import { PIPELINES, REVISION_LABEL, shootDay, statusLabel } from "@/lib/portal/projects";

export const metadata = { title: "Projects" };

type Props = { searchParams: Promise<{ q?: string; status?: string; view?: string }> };

/**
 * Projects (§7.2): every shoot (website bookings arrive here as Requested). A board by status on
 * desktop; on phones (and with "List") one row each with one-tap status buttons. Owner only.
 */
export default async function Projects({ searchParams }: Props) {
  const rpc = await portalAdminPage();
  const f = await searchParams;
  const origin = originFrom(await headers());
  let rows: ProjectListRow[] = [];
  let error = "";
  if (!portalAdminReady()) error = "PORTAL_ADMIN_SECRET isn’t set for this deployment.";
  else
    try {
      rows = await rpc<ProjectListRow[]>("portal_admin_projects", {
        p_type: "shoot",
        p_status: f.status || null,
        p_q: f.q || null,
      });
    } catch (e) {
      error = e instanceof Error ? e.message : "Couldn’t load projects.";
    }
  const statuses = PIPELINES.shoot as readonly string[];
  const target = (r: ProjectListRow) => ({
    id: r.id,
    ref: r.ref,
    title: r.title,
    status: r.status,
    shoot_date: r.shoot_date,
    slot: r.slot,
    meta: r.meta,
    inPortal: !!r.account_id,
    phone: r.lead_phone || null,
    name: r.client_name,
  });

  return (
    <div className="ad-page">
      <div className="ad-head">
        <div>
          <span className="ad-eb">Portal</span>
          <h1 className="ad-h1">Projects</h1>
          <span className="ad-small ad-muted">Shoots. Website bookings arrive as Requested.</span>
        </div>
      </div>
      <form className="ad-filter" method="get" role="search">
        <input
          type="search"
          name="q"
          defaultValue={f.q}
          placeholder="Ref, title or client"
          aria-label="Search projects"
          style={{ flex: "1 1 220px", width: "auto" }}
        />
        <select name="status" defaultValue={f.status ?? ""} aria-label="Status">
          <option value="">All statuses</option>
          {statuses.map((s) => (
            <option key={s} value={s}>
              {statusLabel(s)}
            </option>
          ))}
        </select>
        <button className="ad-btn small" type="submit">
          Filter
        </button>
        {(f.q || f.status) && (
          <Link className="ad-btn quiet small" href="/admin/projects" prefetch={false}>
            Clear
          </Link>
        )}
      </form>
      {error && <p className="ad-note warn">{error}</p>}

      {f.view !== "list" && (
        <div className="ad-board ad-only-wide" data-testid="board">
          {statuses.map((s) => {
            const col = rows.filter((r) => r.status === s);
            return (
              <section key={s} className="ad-col" aria-label={statusLabel(s)}>
                <div className="ad-row-main" style={{ justifyContent: "space-between" }}>
                  <span className="ad-eb">{statusLabel(s)}</span>
                  <span className="ad-eb">{col.length}</span>
                </div>
                {col.map((r) => (
                  <Link
                    key={r.id}
                    href={`/admin/projects/${r.id}`}
                    className="ad-ticket"
                    prefetch={false}
                  >
                    <span className="ad-eb">{r.ref}</span>
                    <b>{r.title}</b>
                    <span className="ad-muted">
                      {r.account_name ?? r.client_name ?? "Not claimed yet"}
                    </span>
                    <span className="ad-muted ad-mono">
                      {[shootDay(r.shoot_date), r.slot].filter(Boolean).join(" · ")}
                      {r.revision_state && r.revision_state !== "delivered"
                        ? ` · ${REVISION_LABEL[r.revision_state]}`
                        : ""}
                    </span>
                  </Link>
                ))}
              </section>
            );
          })}
        </div>
      )}

      <div
        className={`ad-list ${f.view === "list" ? "" : "ad-only-narrow"}`}
        data-testid="project-list"
      >
        {rows.map((r) => (
          <div
            key={r.id}
            className="ad-row ad-lead"
            style={{ alignItems: "start", gridTemplateColumns: "1fr" }}
          >
            <Link href={`/admin/projects/${r.id}`} className="ad-row-main" prefetch={false}>
              <span>
                <span className="ad-row-title">
                  {r.ref} · {r.title}
                </span>
                <span className="ad-row-meta" style={{ display: "block" }}>
                  {[
                    r.account_name ?? r.client_name ?? "Not claimed yet",
                    shootDay(r.shoot_date),
                    r.slot,
                    statusLabel(r.status),
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                  {r.revision_state && r.revision_state !== "delivered"
                    ? ` · ${REVISION_LABEL[r.revision_state]}`
                    : ""}
                </span>
              </span>
            </Link>
            <StatusButtons project={target(r)} options={[...statuses]} origin={origin} />
          </div>
        ))}
        {!rows.length && !error && (
          <p className="ad-empty">
            No projects{f.q || f.status ? " match these filters" : " yet"}.
          </p>
        )}
      </div>
      <p className="ad-small ad-muted">
        <Link
          href={f.view === "list" ? "/admin/projects" : "/admin/projects?view=list"}
          prefetch={false}
        >
          {f.view === "list" ? "Board view" : "List view"}
        </Link>
      </p>
    </div>
  );
}
