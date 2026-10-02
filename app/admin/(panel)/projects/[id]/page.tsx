import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { StatusButtons, WhatsAppButton } from "@/components/admin/ProjectStatus";
import { Deliveries, ProjectNotes, RevisionPanel, Thread } from "@/components/admin/ProjectWork";
import { dubai } from "@/lib/admin/format";
import { portalAdminPage, type ProjectDetail } from "@/lib/portal/admin";
import { originFrom } from "@/lib/portal/invite";
import {
  deliveries,
  PIPELINES,
  REVISION_LABEL,
  SHOOT_SERVICE_LABEL,
  shootDay,
  statusLabel,
} from "@/lib/portal/projects";

export const metadata = { title: "Project" };

const EVENT_TEXT: Record<string, string> = {
  created: "Requested on milkywayy.com",
  status: "Status",
  delivery: "Delivery",
  revision_requested: "Revision requested",
  revision_in_progress: "Revision in progress",
  revision_delivered: "Revision delivered",
  approved: "Approved by the client",
  auto_completed: "Completed automatically",
  note: "Note",
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
  const target = {
    id: p.id,
    ref: p.ref,
    title: p.title,
    status: p.status,
    shoot_date: p.shoot_date,
    slot: p.slot,
    meta: p.meta,
    inPortal: !!p.account_id,
    phone: d.owner?.phone || d.lead?.phone || null,
    name: d.owner?.name || d.lead?.name || d.account?.name || null,
  };
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
          <span className="ad-small ad-muted">
            {p.ref} · {statusLabel(p.status)}
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

      <section className="ad-card ad-form" aria-label="Status">
        <h2 className="ad-h2">Status</h2>
        <StatusButtons project={target} options={[...PIPELINES.shoot]} origin={origin} />
        <span className="ad-small ad-muted">
          “Delivered” happens when you publish a delivery below. Delivered projects complete on
          their own 7 days later unless a revision is open.
        </span>
      </section>

      <div className="ad-grid2">
        <section className="ad-card" aria-label="Details">
          <h2 className="ad-h2">Details</h2>
          <dl className="ad-dl">
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
              {(p.meta.services ?? []).map((s) => SHOOT_SERVICE_LABEL[s] ?? s).join(", ") || "—"}
            </dd>
            <dt>Client</dt>
            <dd>
              {[d.owner?.name ?? d.lead?.name, d.owner?.email ?? d.lead?.email, target.phone]
                .filter(Boolean)
                .join(" · ") || "—"}
            </dd>
            <dt>Price</dt>
            <dd>
              {total
                ? `${d.account?.currency ?? "AED"} ${total.toLocaleString("en-US")} (estimate at booking)`
                : "—"}
            </dd>
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

      <Deliveries project={target} groups={groups} revisionOpen={revisionOpen} origin={origin} />
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
