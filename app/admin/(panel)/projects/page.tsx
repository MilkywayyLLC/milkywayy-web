import { unstable_rethrow } from "next/navigation";
import { headers } from "next/headers";
import Link from "next/link";
import { EmailAttachedBadge } from "@/components/admin/EmailAttachedBadge";
import { Pill } from "@/components/admin/Pill";
import { StatusButtons } from "@/components/admin/ProjectStatus";
import { portalAdminPage, portalAdminReady, type ProjectListRow } from "@/lib/portal/admin";
import { originFrom } from "@/lib/portal/invite";
import {
  addDays,
  areaOf,
  dubaiDay,
  nextAction,
  toStatusTarget,
  whenOf,
} from "@/lib/portal/next-action";
import {
  adminStatuses,
  briefKindLabel,
  shortTitle,
  statusLabel,
  type ProjectType,
} from "@/lib/portal/projects";
import { dayLabel, projectStart } from "@/lib/portal/when";

export const metadata = { title: "Projects" };

type Props = {
  searchParams: Promise<{
    q?: string;
    status?: string;
    view?: string;
    type?: string;
    chip?: string;
  }>;
};

const TYPES: [ProjectType | "all", string][] = [
  ["all", "All"],
  ["shoot", "Shoots"],
  ["edit", "Editing"],
  ["avatar", "Avatars"],
];
const CHIPS = [
  ["", "Open"],
  ["me", "Needs me"],
  ["week", "This week"],
  ["client", "Waiting on client"],
  ["done", "Done"],
] as const;

/**
 * Projects (§7.2; admin redesign, 27 Oct 2026): a list by default — name, client, date + time, area,
 * stage, next action — sorted by what needs doing first. Board is optional (no card cap), Calendar
 * is next door. "Next action" is worked out from the row (lib/portal/next-action), no new data.
 */
export default async function Projects({ searchParams }: Props) {
  const rpc = await portalAdminPage();
  const f = await searchParams;
  const type = (TYPES.some(([t]) => t === f.type) ? f.type : "all") as ProjectType | "all";
  const chip = CHIPS.some(([c]) => c === f.chip) ? (f.chip ?? "") : "";
  const board = f.view === "board";
  const origin = originFrom(await headers());
  let rows: ProjectListRow[] = [];
  let error = "";
  if (!portalAdminReady()) error = "Portal sections are off on this deployment (no admin key).";
  else
    try {
      rows = await rpc<ProjectListRow[]>("portal_admin_projects", {
        p_type: type === "all" ? null : type,
        p_status: f.status || null,
        p_q: f.q || null,
      });
    } catch (e) {
      unstable_rethrow(e); // the refused-key redirect (lib/portal/admin)
      error = e instanceof Error ? e.message : "Couldn’t load projects.";
    }

  const now = new Date();
  const today = dubaiDay(now);
  const weekEnd = addDays(today, 6);
  const closed = (r: ProjectListRow) => r.status === "completed" || r.status === "cancelled";
  const list = rows
    .map((r) => ({ r, next: nextAction(r, now), when: whenOf(r) }))
    .filter(({ r, next, when }) =>
      f.status
        ? true
        : chip === "done"
          ? closed(r)
          : closed(r)
            ? false
            : chip === "me"
              ? next.who === "me"
              : chip === "client"
                ? next.who === "client"
                : chip === "week"
                  ? !!when && when >= today && when <= weekEnd
                  : true,
    )
    .sort(
      (a, b) =>
        (chip === "done" ? 0 : a.next.rank - b.next.rank) ||
        (a.when ?? "9999").localeCompare(b.when ?? "9999"),
    );
  const statuses =
    type === "all"
      ? [...new Set((["shoot", "edit", "avatar"] as const).flatMap(adminStatuses))]
      : adminStatuses(type);
  const href = (o: Record<string, string | undefined>) => {
    const q = new URLSearchParams(
      Object.entries({ type, q: f.q, status: f.status, view: f.view, chip, ...o }).filter(
        (e): e is [string, string] => !!e[1] && !(e[0] === "type" && e[1] === "all"),
      ),
    ).toString();
    return `/admin/projects${q ? `?${q}` : ""}`;
  };
  const whenText = (r: ProjectListRow) =>
    r.type === "shoot"
      ? r.shoot_date
        ? `${dayLabel(r.shoot_date)}${projectStart(r) ? ` · ${projectStart(r)}` : ""}`
        : "—"
      : r.due_at
        ? `Due ${dayLabel(r.due_at.slice(0, 10))}`
        : "—";
  const name = (r: ProjectListRow) =>
    r.type === "shoot" ? shortTitle(r.title) : briefKindLabel(r.type, r.meta.kind) || r.title;
  const area = (r: ProjectListRow) =>
    r.type === "shoot" ? r.meta.area || r.meta.booking?.location?.community || "—" : "—";

  return (
    <div className="ad-page">
      <div className="ad-head">
        <div>
          <span className="ad-eb">Work</span>
          <h1 className="ad-h1">Projects</h1>
        </div>
        <div className="ad-btns">
          <Link className="ad-btn" href="/admin/projects/new" prefetch={false}>
            New project
          </Link>
        </div>
      </div>
      <nav className="ad-tabs" aria-label="Projects view">
        <Link
          href={href({ view: undefined })}
          aria-current={!board ? "page" : undefined}
          prefetch={false}
        >
          List
        </Link>
        <Link
          href={href({ view: "board" })}
          aria-current={board ? "page" : undefined}
          prefetch={false}
        >
          Board
        </Link>
        <Link href="/admin/projects/calendar" prefetch={false}>
          Calendar
        </Link>
      </nav>
      <form className="ad-filter" method="get" role="search">
        {f.view && <input type="hidden" name="view" value={f.view} />}
        {chip && <input type="hidden" name="chip" value={chip} />}
        <input
          type="search"
          name="q"
          defaultValue={f.q}
          placeholder="Ref, title or client"
          aria-label="Search projects"
          className="ad-grow"
        />
        <select name="type" defaultValue={type} aria-label="Project type">
          {TYPES.map(([t, l]) => (
            <option key={t} value={t}>
              {l}
            </option>
          ))}
        </select>
        <select name="status" defaultValue={f.status ?? ""} aria-label="Status">
          <option value="">Any stage</option>
          {statuses.map((s) => (
            <option key={s} value={s}>
              {statusLabel(s)}
            </option>
          ))}
        </select>
        <button className="ad-btn ghost small" type="submit">
          Filter
        </button>
        {(f.q || f.status || type !== "all") && (
          <Link
            className="ad-btn quiet small"
            href={href({ q: undefined, status: undefined, type: "all" })}
            prefetch={false}
          >
            Clear
          </Link>
        )}
      </form>
      {!f.status && (
        <nav className="ad-btns ad-chips" aria-label="Quick filters">
          {CHIPS.map(([c, l]) => (
            <Link
              key={c}
              href={href({ chip: c || undefined })}
              className={`ad-chip${c === chip ? "on" : ""}`}
              aria-current={c === chip ? "page" : undefined}
              prefetch={false}
            >
              {l}
            </Link>
          ))}
        </nav>
      )}
      {error && <p className="ad-note warn">{error}</p>}

      {board ? (
        <div className="ad-board" data-testid="board">
          {statuses
            .filter((s) => list.some(({ r }) => r.status === s) || s !== "cancelled")
            .map((s) => {
              const col = list.filter(({ r }) => r.status === s);
              return (
                <section key={s} className="ad-col" aria-label={statusLabel(s)}>
                  <div className="ad-row-between">
                    <Pill status={s}>{statusLabel(s)}</Pill>
                    <span className="ad-eb">{col.length}</span>
                  </div>
                  {col.map(({ r, next }) => (
                    <Link
                      key={r.id}
                      href={`/admin/projects/${r.id}`}
                      className="ad-ticket"
                      prefetch={false}
                    >
                      <span className="ad-eb">{r.ref}</span>
                      {r.meta.attached_by_email && <EmailAttachedBadge />}
                      <b>{name(r)}</b>
                      <span className="ad-muted">
                        {r.account_name ?? r.client_name ?? "Not claimed yet"}
                      </span>
                      <span className="ad-muted ad-mono">{whenText(r)}</span>
                      {r.type === "shoot" && <span className="ad-muted">{areaOf(r)}</span>}
                      <span className={next.who === "me" ? "ad-next me" : "ad-next"}>
                        {next.text}
                      </span>
                    </Link>
                  ))}
                </section>
              );
            })}
        </div>
      ) : (
        <div className="ad-scroll">
          <table className="ad-table ad-projects" data-testid="project-list">
            <thead>
              <tr>
                <th>Project</th>
                <th>Client</th>
                <th>When</th>
                <th>Area</th>
                <th>Stage</th>
                <th>Next action</th>
                <th aria-label="Status" />
              </tr>
            </thead>
            <tbody>
              {list.map(({ r, next }) => (
                <tr key={r.id}>
                  <td>
                    <Link
                      href={`/admin/projects/${r.id}`}
                      className="ad-cell-link"
                      prefetch={false}
                    >
                      <b>{name(r)}</b>
                      <span className="ad-muted ad-small">
                        {r.ref}
                        {type === "all"
                          ? ` · ${r.type === "shoot" ? "Shoot" : r.type === "edit" ? "Editing" : "Avatar"}`
                          : ""}
                      </span>
                    </Link>
                    {r.meta.attached_by_email && <EmailAttachedBadge />}
                  </td>
                  <td data-label="Client">
                    {r.account_name ?? r.client_name ?? "Not claimed yet"}
                  </td>
                  <td data-label="When" className="ad-mono ad-nowrap">
                    {whenText(r)}
                  </td>
                  <td data-label="Area">{area(r)}</td>
                  <td data-label="Stage">
                    <Pill status={r.status}>{statusLabel(r.status)}</Pill>
                  </td>
                  <td data-label="Next">
                    <span className={next.who === "me" ? "ad-next me" : "ad-next"}>
                      {next.text}
                    </span>
                  </td>
                  <td>
                    <details className="ad-status-menu">
                      <summary className="ad-btn quiet small">Status</summary>
                      <StatusButtons
                        project={toStatusTarget(r)}
                        options={adminStatuses(r.type)}
                        origin={origin}
                      />
                    </details>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!list.length && !error && (
            <p className="ad-empty">
              No projects{f.q || f.status || chip ? " match these filters" : " yet"}.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
