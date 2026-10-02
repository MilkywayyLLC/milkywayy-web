import { notFound } from "next/navigation";
import { LiveRefresh } from "@/components/portal/LiveRefresh";
import {
  DownloadButton,
  ProjectActions,
  ProjectMessages,
} from "@/components/portal/ProjectActions";
import { Back, Badge, Stepper } from "@/components/portal/ui";
import { requireAccount } from "@/lib/portal/auth";
import {
  bytes,
  clientStatus,
  deliveries,
  kindLabel,
  SHOOT_SERVICE_LABEL,
  shootDay,
  statusLabel,
  stepsFor,
  type Project,
  type ProjectEvent,
  type ProjectFile,
  type ProjectMessage,
} from "@/lib/portal/projects";
import { isManager } from "@/lib/portal/shell";

export const metadata = { title: "Shoot" };

const EVENT_TEXT: Record<string, (e: ProjectEvent) => string> = {
  created: () => "Requested on milkywayy.com",
  status: (e) => `${statusLabel(e.to_status ?? "")}${e.note ? `: ${e.note}` : ""}`,
  delivery: (e) => e.note ?? "Delivered",
  revision_requested: (e) => `Revision requested${e.note ? `: “${e.note}”` : ""}`,
  revision_in_progress: () => "Revision in progress",
  revision_delivered: () => "Revision delivered",
  approved: () => "Approved",
  auto_completed: () => "Completed automatically, 7 days after delivery",
  note: (e) => e.note ?? "",
};

/** One shoot (§5.2): status, deliveries and downloads, revision, approve, details, activity, messages. */
export default async function ShootPage({ params }: { params: Promise<{ ref: string }> }) {
  const { ref } = await params;
  const { db, current } = await requireAccount(`/portal/shoots/${ref}`);
  const { data } = await db
    .from("projects")
    .select("*")
    .eq("ref", decodeURIComponent(ref))
    .eq("type", "shoot")
    .maybeSingle();
  if (!data) notFound();
  const p = data as Project;
  const [{ data: files }, { data: events }, { data: messages }, { data: items }] =
    await Promise.all([
      db
        .from("project_files")
        .select("*")
        .eq("project_id", p.id)
        .eq("direction", "out")
        .order("created_at"),
      db
        .from("project_events")
        .select("*")
        .eq("project_id", p.id)
        .order("at", { ascending: false }),
      db
        .from("project_messages")
        .select("id, author_name, is_admin, body, at")
        .eq("project_id", p.id)
        .order("at"),
      isManager(current)
        ? db
            .from("line_items")
            .select("description, qty, unit_price, currency")
            .eq("project_id", p.id)
        : Promise.resolve({ data: [] }),
    ]);
  const groups = deliveries((files ?? []) as ProjectFile[]);
  const latest = groups[0];
  const zip = latest?.files.find((f) => f.kind === "zip");
  const autoDay =
    p.status === "delivered" && p.delivered_at
      ? new Date(new Date(p.delivered_at).getTime() + 7 * 864e5).toLocaleDateString("en-GB", {
          weekday: "short",
          day: "numeric",
          month: "short",
        })
      : null;
  const when = [shootDay(p.shoot_date), p.slot].filter(Boolean).join(" · ");
  const total = (items ?? []).reduce((t, i) => t + Number(i.qty) * Number(i.unit_price), 0);

  return (
    <>
      <LiveRefresh />
      <Back href="/portal/shoots" label="Shoots" />
      <div className="pt-head">
        <div>
          <span className="pt-eb">
            {p.ref}
            {when ? ` · ${when}` : ""}
          </span>
          <h1 className="pt-h1" style={{ fontSize: 26 }}>
            {p.title}
          </h1>
        </div>
        <Badge tone={p.status === "delivered" ? "gold" : undefined}>{clientStatus(p)}</Badge>
      </div>
      <Stepper steps={stepsFor("shoot")} now={statusLabel(p.status)} />

      {p.status === "delivered" &&
        !(p.revision_state === "requested" || p.revision_state === "in_progress") &&
        autoDay && (
          <p className="pt-meta" style={{ margin: 0 }}>
            Happy with it? Approve to complete. Otherwise it completes on its own on {autoDay}.
          </p>
        )}
      {(p.revision_state === "requested" || p.revision_state === "in_progress") && (
        <p className="pt-note" role="status">
          Revision {p.revision_rounds_used} of {p.revision_rounds_allowed} is{" "}
          {p.revision_state === "requested" ? "with us" : "in progress"}. We’ll email you when it’s
          ready.
        </p>
      )}

      <ProjectActions
        projectId={p.id}
        zipId={zip?.id ?? null}
        canRevise={
          p.status === "delivered" &&
          !(p.revision_state === "requested" || p.revision_state === "in_progress") &&
          p.revision_rounds_used < p.revision_rounds_allowed
        }
        canApprove={
          p.status === "delivered" &&
          !(p.revision_state === "requested" || p.revision_state === "in_progress")
        }
        round={{ next: p.revision_rounds_used + 1, of: p.revision_rounds_allowed }}
        hasDelivery={!!latest}
      />

      {groups.map((d) => (
        <section key={d.no} className="pt-card" aria-label={d.label} data-testid="delivery">
          <div className="pt-row">
            <h2 className="pt-h2">{d.label}</h2>
            <span className="pt-meta pt-mono">
              {new Date(d.files[0].created_at).toLocaleDateString("en-GB", {
                day: "numeric",
                month: "short",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          </div>
          <div className="pt-list">
            {d.files.map((f) => (
              <div key={f.id} className="pt-file">
                <div>
                  <b>{f.label}</b>
                  <div className="pt-meta">
                    {[kindLabel(f.kind), bytes(f.bytes)].filter(Boolean).join(" · ")}
                    {f.expires_at
                      ? ` · kept until ${new Date(f.expires_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`
                      : ""}
                  </div>
                </div>
                <DownloadButton
                  fileId={f.id}
                  label={f.source === "link" || f.kind === "tour" ? "Open" : "Download"}
                  name={f.label}
                />
              </div>
            ))}
          </div>
        </section>
      ))}

      <div className="pt-grid2">
        <section className="pt-card">
          <h2 className="pt-h2">Details</h2>
          <dl style={{ display: "grid", gap: 8, margin: 0 }}>
            {(
              [
                [
                  "Address",
                  [p.meta.unit && `Unit ${p.meta.unit}`, p.meta.building, p.meta.area]
                    .filter(Boolean)
                    .join(", "),
                ],
                [
                  "Services",
                  (p.meta.services ?? []).map((s) => SHOOT_SERVICE_LABEL[s] ?? s).join(", "),
                ],
                ["When", when || "To be confirmed"],
                ...(isManager(current) && total > 0
                  ? [
                      [
                        "Price",
                        `${current.account.currency} ${total.toLocaleString("en-US")} (estimate at booking)`,
                      ],
                    ]
                  : []),
              ] as [string, string][]
            )
              .filter(([, v]) => v)
              .map(([k, v]) => (
                <div key={k} style={{ display: "grid", gap: 2 }}>
                  <dt className="pt-eb">{k}</dt>
                  <dd style={{ margin: 0 }}>{v}</dd>
                </div>
              ))}
          </dl>
        </section>
        <section className="pt-card">
          <h2 className="pt-h2">Activity</h2>
          <ul className="pt-timeline" data-testid="activity">
            {((events ?? []) as ProjectEvent[]).map((e) => (
              <li key={e.id}>
                <div style={{ display: "grid" }}>
                  <span>{(EVENT_TEXT[e.kind] ?? (() => e.kind))(e)}</span>
                  <span className="pt-meta pt-mono">
                    {new Date(e.at).toLocaleString("en-GB", {
                      day: "numeric",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                      timeZone: "Asia/Dubai",
                    })}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <ProjectMessages projectId={p.id} messages={(messages ?? []) as ProjectMessage[]} />
    </>
  );
}
