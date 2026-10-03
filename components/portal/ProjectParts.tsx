import { DownloadButton } from "@/components/portal/ProjectActions";
import {
  bytes,
  day,
  deliveries,
  kindLabel,
  statusLabel,
  type Project,
  type ProjectEvent,
  type ProjectFile,
} from "@/lib/portal/projects";

/** Pieces every project page shares (shoots, editing batches, avatar videos). */

const EVENT_TEXT: Record<string, (e: ProjectEvent) => string> = {
  created: (e) =>
    e.actor_name === "Website booking"
      ? "Requested on milkywayy.com"
      : `${statusLabel(e.to_status ?? "")} by ${e.actor_name ?? "you"}`,
  status: (e) => `${statusLabel(e.to_status ?? "")}${e.note ? `: ${e.note}` : ""}`,
  delivery: (e) => e.note ?? "Delivered",
  revision_requested: (e) => `Revision requested${e.note ? `: “${e.note}”` : ""}`,
  revision_in_progress: () => "Revision in progress",
  revision_delivered: () => "Revision delivered",
  approved: () => "Approved",
  auto_completed: () => "Completed automatically, 7 days after delivery",
  note: (e) => e.note ?? "",
  files_added: (e) => `Files added: ${e.note ?? ""}`,
  script_posted: (e) => e.note ?? "Script ready for approval",
  script_approved: (e) => `${e.note ?? "Script approved"} by ${e.actor_name ?? "you"}`,
  script_changes: (e) => `Changes asked: ${e.note ?? ""}`,
};

const when = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Dubai",
  });

export function ActivityList({ events }: { events: ProjectEvent[] }) {
  return (
    <section className="pt-card">
      <h2 className="pt-h2">Activity</h2>
      <ul className="pt-timeline" data-testid="activity">
        {events.map((e) => (
          <li key={e.id}>
            <div style={{ display: "grid" }}>
              <span>{(EVENT_TEXT[e.kind] ?? (() => e.kind))(e)}</span>
              <span className="pt-meta pt-mono">{when(e.at)}</span>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Published deliveries, newest first; each file opens or downloads by a short-lived link. */
export function DeliveryList({ files }: { files: ProjectFile[] }) {
  return (
    <>
      {deliveries(files).map((d) => (
        <section key={d.no} className="pt-card" aria-label={d.label} data-testid="delivery">
          <div className="pt-row">
            <h2 className="pt-h2">{d.label}</h2>
            <span className="pt-meta pt-mono">{when(d.files[0].created_at)}</span>
          </div>
          <div className="pt-list">
            {d.files.map((f) => (
              <div key={f.id} className="pt-file">
                <div>
                  <b>{f.label}</b>
                  <div className="pt-meta">
                    {[kindLabel(f.kind), bytes(f.bytes)].filter(Boolean).join(" · ")}
                    {f.expires_at ? ` · kept until ${day(f.expires_at, true)}` : ""}
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
    </>
  );
}

/** The raw files and links the client sent us. */
export function FilesInList({ files }: { files: ProjectFile[] }) {
  const ins = files.filter((f) => f.direction === "in");
  if (!ins.length)
    return (
      <p className="pt-meta" style={{ margin: 0 }}>
        No files yet.
      </p>
    );
  return (
    <div className="pt-list" data-testid="files-in">
      {ins.map((f) => (
        <div key={f.id} className="pt-file">
          <div style={{ minWidth: 0 }}>
            <b style={{ overflowWrap: "anywhere" }}>{f.label}</b>
            <div className="pt-meta" style={{ overflowWrap: "anywhere" }}>
              {f.source === "link" ? f.url : bytes(f.bytes)}
              {f.expires_at ? ` · deleted ${day(f.expires_at, true)}` : ""}
            </div>
          </div>
          <DownloadButton
            fileId={f.id}
            label={f.source === "link" ? "Open" : "Download"}
            name={f.label}
          />
        </div>
      ))}
    </div>
  );
}

const busyRevision = (p: Project) =>
  p.revision_state === "requested" || p.revision_state === "in_progress";

/** "Approve or it completes on …" and "Revision n is with us". */
export function ApprovalNote({ p }: { p: Project }) {
  const autoDay =
    p.status === "delivered" && p.delivered_at
      ? new Date(new Date(p.delivered_at).getTime() + 7 * 864e5).toLocaleDateString("en-GB", {
          weekday: "short",
          day: "numeric",
          month: "short",
        })
      : null;
  if (busyRevision(p))
    return (
      <p className="pt-note" role="status">
        Revision {p.revision_rounds_used} of {p.revision_rounds_allowed} is{" "}
        {p.revision_state === "requested" ? "with us" : "in progress"}. We’ll email you when it’s
        ready.
      </p>
    );
  if (autoDay)
    return (
      <p className="pt-meta" style={{ margin: 0 }}>
        Happy with it? Approve to complete. Otherwise it completes on its own on {autoDay}.
      </p>
    );
  return null;
}

export const actionsFor = (p: Project) => ({
  canRevise:
    p.status === "delivered" &&
    !busyRevision(p) &&
    p.revision_rounds_used < p.revision_rounds_allowed,
  canApprove: p.status === "delivered" && !busyRevision(p),
  round: { next: p.revision_rounds_used + 1, of: p.revision_rounds_allowed },
});
