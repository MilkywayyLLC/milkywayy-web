import Link from "next/link";
import { projectWhen } from "@/lib/portal/when";
import type { RequestConfig } from "@/lib/portal/requests";
import {
  briefKindLabel,
  clientStatus,
  day,
  PIPELINES,
  SHOOT_SERVICE_LABEL,
  shortTitle,
  statusLabel,
  TYPE_PATH,
  type Project,
} from "@/lib/portal/projects";

const active = (p: Project) => p.status !== "completed" && p.status !== "cancelled";

const weekday = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { weekday: "short", timeZone: "Asia/Dubai" });

/** "Editing, delivery expected Thu"; an open revision reads as its own status, not a step. */
function statusText(p: Project) {
  const s = clientStatus(p);
  const before = ["delivered", "completed", "cancelled", "on_hold"].includes(p.status);
  return p.due_at && !before && !p.revision_state
    ? `${s}, delivery expected ${weekday(p.due_at)}`
    : s;
}

function service(p: Project) {
  if (p.type === "shoot")
    return (p.meta.services ?? []).map((s) => SHOOT_SERVICE_LABEL[s] ?? s).join(", ");
  return p.meta.kind ? briefKindLabel(p.type, p.meta.kind) : "";
}

/** The backend's real stages as a 2px line with small labels (current bold, done dark). */
function Steps({ p }: { p: Project }) {
  const steps = PIPELINES[p.type] as readonly string[];
  const at = p.status === "on_hold" ? 1 : Math.max(0, steps.indexOf(p.status));
  return (
    <ol
      className="pt-wsteps"
      style={{ ["--n" as string]: steps.length, ["--at" as string]: at }}
      aria-label={`Step ${at + 1} of ${steps.length}: ${statusLabel(steps[at])}`}
    >
      {steps.map((s, i) => (
        <li
          key={s}
          className={i < at ? "is-done" : i === at ? "is-now" : undefined}
          aria-current={i === at ? "step" : undefined}
        >
          {statusLabel(s)}
        </li>
      ))}
    </ol>
  );
}

/**
 * Home → active shoots (owner, 28 Oct 2026): the three latest open shoots as one text row each, the
 * real stages as a 2px line, then View all. A draft awaiting payment has no stages: it gets Finish
 * payment instead. With shoots switched off it shows the open editing / avatar work.
 */
export function YourWork({
  projects,
  cfg,
  payHrefs,
}: {
  projects: Project[];
  cfg: RequestConfig;
  /** Draft project id → its checkout page (the unpaid booking invoice). */
  payHrefs: Record<string, string>;
}) {
  const open = projects.filter(active);
  const items = cfg.shoots
    ? open.filter((p) => p.type === "shoot")
    : open.filter((p) => p.type !== "shoot");
  const name = cfg.shoots ? "Active shoots" : "Active work";
  const all = cfg.shoots ? TYPE_PATH.shoot : TYPE_PATH[items[0]?.type ?? "edit"];
  if (!items.length) return null;
  return (
    <section className="pt-work" aria-labelledby="work" data-testid="your-work">
      <div className="pt-row">
        <h2 id="work" className="pt-eb">
          {name}
        </h2>
        <Link href={all} className="lnk pt-small" prefetch={false}>
          View all
        </Link>
      </div>
      <ul className="pt-work-items">
        {items.slice(0, 3).map((p) => {
          const to = `${TYPE_PATH[p.type]}/${encodeURIComponent(p.ref)}`;
          const draft = p.status === "awaiting_payment";
          const when = p.type === "shoot" && p.shoot_date ? projectWhen(p) : day(p.created_at);
          const body = (
            <>
              <span className="pt-wbody">
                <b className="pt-title">{shortTitle(p.title)}</b>
                <span className="pt-meta">
                  {[p.ref, when, service(p)].filter(Boolean).join(" · ")}
                </span>
                {!draft && <Steps p={p} />}
              </span>
              <span className="pt-wside">
                <span className="pt-wstatus">{statusText(p)}</span>
                {!draft && <span className="lnk pt-small">Open →</span>}
              </span>
            </>
          );
          return (
            <li key={p.id}>
              {draft ? (
                <div className="pt-wrow" data-testid="work-draft">
                  {body}
                  <Link
                    href={payHrefs[p.id] ?? to}
                    prefetch={false}
                    className="btn btn-p btn-s"
                    style={{ justifySelf: "start" }}
                  >
                    Finish payment
                  </Link>
                </div>
              ) : (
                <Link href={to} prefetch={false} className="pt-wrow">
                  {body}
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
