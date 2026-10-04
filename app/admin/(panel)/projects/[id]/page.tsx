import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EmailAttachedBadge } from "@/components/admin/EmailAttachedBadge";
import { LineItems } from "@/components/admin/BillingTools";
import { AttachToClient } from "@/components/admin/ClientProjectTools";
import { FilesIn, ScriptPanel } from "@/components/admin/ProjectBrief";
import { StatusButtons, WhatsAppButton, type StatusTarget } from "@/components/admin/ProjectStatus";
import { Deliveries, ProjectNotes, RevisionPanel, Thread } from "@/components/admin/ProjectWork";
import { dubai } from "@/lib/admin/format";
import { portalAdminPage, type ClientListRow, type ProjectDetail } from "@/lib/portal/admin";
import { originFrom } from "@/lib/portal/invite";
import {
  adminStatuses,
  briefKindLabel,
  day,
  deliveries,
  REVISION_LABEL,
  TYPE_LABEL,
  SHOOT_SERVICE_LABEL,
  shootDay,
  statusLabel,
} from "@/lib/portal/projects";

export const metadata = { title: "Project" };

const EVENT_TEXT: Record<string, string> = {
  created: "Created",
  status: "Status",
  delivery: "Delivery",
  revision_requested: "Revision requested",
  revision_in_progress: "Revision in progress",
  revision_delivered: "Revision delivered",
  approved: "Approved by the client",
  auto_completed: "Completed automatically",
  note: "Note",
  files_added: "Files added",
  script_posted: "Script posted",
  script_approved: "Script approved",
  script_changes: "Script changes asked",
};

/** One project (§7.2): status, deliveries, revisions, messages, notes, notifications, activity. */
export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const rpc = await portalAdminPage();
  const d = await rpc<ProjectDetail | null>("portal_admin_project", { p_id: id });
  if (!d) notFound();
  const origin = originFrom(await headers());
  const p = d.project;
  const clients =
    !p.account_id && d.lead
      ? ((await rpc<ClientListRow[]>("portal_admin_clients", {})) ?? [])
          .map((c) => ({ id: c.id, name: c.name }))
          .sort((a, b) => a.name.localeCompare(b.name))
      : [];
  // WhatsApp goes to whoever submitted it (batches, avatar briefs), else the booking, else the Owner.
  const target: StatusTarget = {
    id: p.id,
    ref: p.ref,
    title: p.title,
    type: p.type,
    status: p.status,
    status_note: p.status_note,
    shoot_date: p.shoot_date,
    slot: p.slot,
    meta: p.meta,
    inPortal: !!p.account_id,
    phone: d.submitter?.phone || d.lead?.phone || d.owner?.phone || null,
    name: d.submitter?.name || d.lead?.name || d.owner?.name || d.account?.name || null,
  };
  const shoot = p.type === "shoot";
  const groups = deliveries(d.files);
  const revisionOpen = p.revision_state === "requested" || p.revision_state === "in_progress";
  const total = d.line_items.reduce((t, i) => t + Number(i.qty) * Number(i.unit_price), 0);

  return (
    <div className="ad-page">
      <div className="ad-head">
        <div>
          <Link className="ad-eb" href="/admin/projects" prefetch={false}>
            ← Projects
          </Link>
          <h1 className="ad-h1">{p.title}</h1>
          {p.meta.attached_by_email && <EmailAttachedBadge />}
          {p.meta.past && (
            <p className="ad-note" data-testid="past-note" style={{ margin: "6px 0" }}>
              Past project (before the portal), delivered{" "}
              {p.meta.original_date
                ? new Date(`${p.meta.original_date}T12:00:00`).toLocaleDateString("en-GB", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })
                : "earlier"}
              . Add the files below and publish them: they stay Completed, the client isn’t emailed
              unless you tick it, and each file is kept for the client’s retention period from the
              day it’s published (dates shown on the files).
            </p>
          )}
          <span className="ad-small ad-muted">
            {TYPE_LABEL[p.type]} · {p.ref} · {statusLabel(p.status)}
            {p.revision_state ? ` · ${REVISION_LABEL[p.revision_state]}` : ""} ·{" "}
            {d.account ? (
              <Link href={`/admin/accounts/${d.account.id}`} prefetch={false}>
                {d.account.name}
              </Link>
            ) : (
              `${d.lead?.name ?? "Client"} (not in the portal yet)`
            )}
          </span>
        </div>
        <div className="ad-btns">
          <WhatsAppButton
            project={target}
            event="status"
            origin={origin}
            label="WhatsApp the client"
            small
          />
          {d.lead && (
            <Link
              className="ad-btn ghost small"
              href={`/admin/leads/${d.lead.ref}`}
              prefetch={false}
            >
              Booking
            </Link>
          )}
        </div>
      </div>

      {!p.account_id && d.lead && <AttachToClient bookingRef={d.lead.ref} clients={clients} />}

      <section className="ad-card ad-form" aria-label="Status">
        <h2 className="ad-h2">Status</h2>
        <StatusButtons project={target} options={adminStatuses(p.type)} origin={origin} />
        {p.status === "on_hold" && p.status_note && (
          <p className="ad-note warn">Waiting on the client: {p.status_note}</p>
        )}
        <span className="ad-small ad-muted">
          “Delivered” happens when you publish a delivery below. Delivered projects complete on
          their own 7 days later unless a revision is open.
          {p.type === "avatar" ? " In production needs the client’s approved script." : ""}
        </span>
      </section>

      <div className="ad-grid2">
        <section className="ad-card" aria-label="Details">
          <h2 className="ad-h2">Details</h2>
          <dl className="ad-dl">
            {shoot ? (
              <>
                <dt>When</dt>
                <dd>{[shootDay(p.shoot_date), p.slot].filter(Boolean).join(" · ") || "—"}</dd>
                <dt>Where</dt>
                <dd>
                  {[p.meta.unit && `Unit ${p.meta.unit}`, p.meta.building, p.meta.area]
                    .filter(Boolean)
                    .join(", ") || "—"}
                </dd>
                <dt>Services</dt>
                <dd>
                  {(p.meta.services ?? []).map((s) => SHOOT_SERVICE_LABEL[s] ?? s).join(", ") ||
                    "—"}
                </dd>
              </>
            ) : (
              <>
                <dt>{p.type === "avatar" ? "Length" : "What"}</dt>
                <dd>{briefKindLabel(p.type, p.meta.kind) || "—"}</dd>
                {p.type === "edit" && (
                  <>
                    <dt>Quantity</dt>
                    <dd>{p.meta.quantity ?? "—"}</dd>
                  </>
                )}
                {p.type === "avatar" && (
                  <>
                    <dt>Script</dt>
                    <dd>{p.meta.script_by === "client" ? "Client sends it" : "We write it"}</dd>
                  </>
                )}
                <dt>Wanted by</dt>
                <dd>{p.due_at ? day(p.due_at, true) : "—"}</dd>
                <dt>Notes</dt>
                <dd style={{ whiteSpace: "pre-wrap" }}>{p.meta.notes ?? "—"}</dd>
                <dt>Reference</dt>
                <dd style={{ overflowWrap: "anywhere" }}>
                  {(p.meta.references ?? []).length
                    ? (p.meta.references ?? []).map((r) => (
                        <a
                          key={r}
                          href={r}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ display: "block" }}
                        >
                          {r}
                        </a>
                      ))
                    : "—"}
                </dd>
                <dt>Submitted by</dt>
                <dd>
                  {[d.submitter?.name, d.submitter?.email].filter(Boolean).join(" · ") || "—"}
                </dd>
              </>
            )}
            <dt>Client</dt>
            <dd>
              {[d.owner?.name ?? d.lead?.name, d.owner?.email ?? d.lead?.email, target.phone]
                .filter(Boolean)
                .join(" · ") || "—"}
            </dd>
            {shoot && (
              <>
                <dt>Price</dt>
                <dd>
                  {total
                    ? `${d.account?.currency ?? "AED"} ${total.toLocaleString("en-US")} (${d.lead ? "estimate at booking" : "agreed price"})`
                    : "—"}
                </dd>
              </>
            )}
            <dt>Files kept</dt>
            <dd>
              {d.account
                ? `${d.account.retention_months} months after completion`
                : "12 months after completion"}
            </dd>
          </dl>
        </section>
        <RevisionPanel
          projectId={p.id}
          state={p.revision_state}
          used={p.revision_rounds_used}
          allowed={p.revision_rounds_allowed}
        />
      </div>

      {p.type === "avatar" && <ScriptPanel project={target} scripts={d.scripts} origin={origin} />}
      {!shoot && <FilesIn projectId={p.id} files={d.files} />}
      <Deliveries
        project={target}
        groups={groups}
        revisionOpen={revisionOpen}
        origin={origin}
        past={!!p.meta.past}
      />
      {p.account_id && <LineItems project={p.id} items={d.line_items} />}
      <Thread project={target} messages={d.messages} origin={origin} />
      <ProjectNotes projectId={p.id} notes={d.notes ?? ""} />

      <div className="ad-grid2">
        <section className="ad-card" aria-label="Notifications">
          <h2 className="ad-h2">Notifications</h2>
          <div className="ad-list" data-testid="notifications">
            {d.notifications.map((n) => (
              <div key={n.id} className="ad-row ad-lead">
                <span
                  className={`ad-pill ${n.status === "sent" || n.status === "opened" ? "live" : "draft"}`}
                >
                  {n.channel}
                </span>
                <span className="ad-row-main">
                  <span>
                    <span className="ad-row-title">
                      {n.template} → {n.to_address}
                    </span>
                    <span className="ad-row-meta" style={{ display: "block" }}>
                      {n.status}
                      {n.error ? ` (${n.error})` : ""} · {dubai(n.at, true)}
                    </span>
                  </span>
                </span>
              </div>
            ))}
            {!d.notifications.length && <p className="ad-empty">Nothing sent yet.</p>}
          </div>
        </section>
        <section className="ad-card" aria-label="Activity">
          <h2 className="ad-h2">Activity</h2>
          <div className="ad-list">
            {d.events.map((e) => (
              <div key={e.id} className="ad-row ad-lead">
                <span className="ad-row-main">
                  <span>
                    <span className="ad-row-title">
                      {EVENT_TEXT[e.kind] ?? e.kind}
                      {e.kind === "status"
                        ? `: ${statusLabel(e.from_status ?? "")} → ${statusLabel(e.to_status ?? "")}`
                        : ""}
                      {e.note && e.kind !== "status" ? `: ${e.note}` : ""}
                    </span>
                    <span className="ad-row-meta" style={{ display: "block" }}>
                      {e.actor_name} · {dubai(e.at, true)}
                    </span>
                  </span>
                </span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
