import { headers } from "next/headers";
import Link from "next/link";
import { EmailAttachedBadge } from "@/components/admin/EmailAttachedBadge";
import { StatusButtons, type StatusTarget } from "@/components/admin/ProjectStatus";
import { portalAdminPage, portalAdminReady, type ProjectListRow } from "@/lib/portal/admin";
import { originFrom } from "@/lib/portal/invite";
import {
  adminStatuses,
  briefKindLabel,
  day,
  REVISION_LABEL,
  shootDay,
  statusLabel,
  type ProjectType,
} from "@/lib/portal/projects";

export const metadata = { title: "Projects" };

type Props = {
  searchParams: Promise<{ q?: string; status?: string; view?: string; type?: string }>;
};

const TYPES: [ProjectType, string][] = [
  ["shoot", "Shoots"],
  ["edit", "Editing"],
  ["avatar", "Avatars"],
];
const SCRIPT: Record<string, string> = {
  pending: "script with client",
  changes_requested: "script changes asked",
  approved: "script approved",
};
const BOARD_LIMIT = 12;

/** One line under a ticket: what matters for that kind of project. */
function facts(r: ProjectListRow) {
  const revision =
    r.revision_state && r.revision_state !== "delivered" ? REVISION_LABEL[r.revision_state] : "";
  const due = r.due_at ? `by ${day(r.due_at)}` : "";
  if (r.type === "shoot")
    return [shootDay(r.shoot_date), r.slot, revision].filter(Boolean).join(" · ");
  if (r.type === "avatar")
    return [
      briefKindLabel("avatar", r.meta.kind),
      r.script_status ? SCRIPT[r.script_status] : "",
      due,
      revision,
    ]
      .filter(Boolean)
      .join(" · ");
  return [
    briefKindLabel("edit", r.meta.kind),
    r.meta.quantity ? `${r.meta.quantity} items` : "",
    `${r.files_in} file${r.files_in === 1 ? "" : "s"} in`,
    due,
    revision,
  ]
    .filter(Boolean)
    .join(" · ");
}

/**
 * Projects (§7.2): shoots (website bookings arrive as Requested), editing batches and avatar
 * videos, each on its own pipeline. A board by status on desktop; on phones (and with "List") one
 * row each with one-tap status buttons. Owner only.
 */
export default async function Projects({ searchParams }: Props) {
  const rpc = await portalAdminPage();
  const f = await searchParams;
  const type: ProjectType = f.type === "edit" || f.type === "avatar" ? f.type : "shoot";
  const origin = originFrom(await headers());
  let rows: ProjectListRow[] = [];
  let error = "";
  if (!portalAdminReady()) error = "PORTAL_ADMIN_SECRET isn’t set for this deployment.";
  else
    try {
      rows = await rpc<ProjectListRow[]>("portal_admin_projects", {
        p_type: type,
        p_status: f.status || null,
        p_q: f.q || null,
      });
    } catch (e) {
      error = e instanceof Error ? e.message : "Couldn’t load projects.";
    }
  const statuses = adminStatuses(type);
  const target = (r: ProjectListRow): StatusTarget => ({
    id: r.id,
    ref: r.ref,
    title: r.title,
    type: r.type,
    status: r.status,
    status_note: r.status_note,
    shoot_date: r.shoot_date,
    slot: r.slot,
    meta: r.meta,
    inPortal: !!r.account_id,
    phone: r.lead_phone || null,
    name: r.client_name,
  });
  const href = (o: Record<string, string | undefined>) => {
    const q = new URLSearchParams(
      Object.entries({ type, q: f.q, status: f.status, view: f.view, ...o }).filter(
        (e): e is [string, string] => !!e[1] && !(e[0] === "type" && e[1] === "shoot"),
      ),
    ).toString();
    return `/admin/projects${q ? `?${q}` : ""}`;
  };

  return (
    <div className="ad-page">
      <div className="ad-head">
        <div>
          <span className="ad-eb">Portal</span>
          <h1 className="ad-h1">Projects</h1>
          <span className="ad-small ad-muted">
            {type === "shoot"
              ? "Shoots. Website bookings arrive as Requested."
              : type === "edit"
                ? "Editing batches clients submit in the portal."
                : "AI avatar videos. Production waits for the client to approve the script."}
          </span>
        </div>
        <div className="ad-btns">
          <Link className="ad-btn ghost small" href="/admin/projects/calendar" prefetch={false}>
            Calendar
          </Link>
          <Link className="ad-btn small" href="/admin/projects/new" prefetch={false}>
            New project
          </Link>
        </div>
      </div>
      <nav className="ad-btns" aria-label="Project type">
        {TYPES.map(([t, label]) => (
          <Link
            key={t}
            href={href({ type: t, status: undefined })}
            className={`ad-btn small ${t === type ? "" : "ghost"}`}
            aria-current={t === type ? "page" : undefined}
            prefetch={false}
          >
            {label}
          </Link>
        ))}
      </nav>
      <form className="ad-filter" method="get" role="search">
        {type !== "shoot" && <input type="hidden" name="type" value={type} />}
        {f.view && <input type="hidden" name="view" value={f.view} />}
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
          <Link
            className="ad-btn quiet small"
            href={href({ q: undefined, status: undefined })}
            prefetch={false}
          >
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
                {col.slice(0, BOARD_LIMIT).map((r) => (
                  <Link
                    key={r.id}
                    href={`/admin/projects/${r.id}`}
                    className="ad-ticket"
                    prefetch={false}
                  >
                    <span className="ad-eb">{r.ref}</span>
                    {r.meta.attached_by_email && <EmailAttachedBadge />}
                    <b>{r.title}</b>
                    <span className="ad-muted">
                      {r.account_name ?? r.client_name ?? "Not claimed yet"}
                    </span>
                    <span className="ad-muted ad-mono">{facts(r)}</span>
                    {r.status === "on_hold" && r.status_note && (
                      <span className="ad-small">Waiting: {r.status_note}</span>
                    )}
                  </Link>
                ))}
                {col.length > BOARD_LIMIT && (
                  <Link
                    className="ad-small"
                    href={href({ status: s, view: "list" })}
                    prefetch={false}
                  >
                    +{col.length - BOARD_LIMIT} more
                  </Link>
                )}
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
                  {r.ref} · {r.title} {r.meta.attached_by_email && <EmailAttachedBadge />}
                </span>
                <span className="ad-row-meta" style={{ display: "block" }}>
                  {[
                    r.account_name ?? r.client_name ?? "Not claimed yet",
                    statusLabel(r.status),
                    facts(r),
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                  {r.status === "on_hold" && r.status_note ? ` · waiting: ${r.status_note}` : ""}
                </span>
              </span>
            </Link>
            <StatusButtons project={target(r)} options={statuses} origin={origin} />
          </div>
        ))}
        {!rows.length && !error && (
          <p className="ad-empty">
            No projects{f.q || f.status ? " match these filters" : " yet"}.
          </p>
        )}
      </div>
      <p className="ad-small ad-muted">
        <Link href={href({ view: f.view === "list" ? undefined : "list" })} prefetch={false}>
          {f.view === "list" ? "Board view" : "List view"}
        </Link>
      </p>
    </div>
  );
}
