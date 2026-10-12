import Link from "next/link";
import type { RequestConfig } from "@/lib/portal/requests";
import {
  briefKindLabel,
  clientStatus,
  day,
  PIPELINES,
  SHOOT_SERVICE_LABEL,
  shootDay,
  statusLabel,
  TYPE_PATH,
  type Project,
} from "@/lib/portal/projects";
import { Icon } from "./Icon";
import { StartRequests } from "./StartRequests";

type Cat = { key: string; name: string; icon: string; href: string; items: Project[] };

/** A website booking, or a portal booking with a property in it. */
const isProperty = (p: Project) =>
  !p.meta.booking || p.meta.booking.services.some((s) => s.service === "property");
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
          className={i < at ? "done" : i === at ? "now" : undefined}
          aria-current={i === at ? "step" : undefined}
        >
          {statusLabel(s)}
        </li>
      ))}
    </ol>
  );
}

/**
 * Home → Your work (site-refine, Oct 2026): grouped by kind (property shoots, video shoots,
 * editing, AI avatars; empty groups hidden), one full-width row per item: a cover thumbnail
 * once delivered (an icon tile before, never an empty box), title and meta, the real stages,
 * and the status in words with Open →.
 */
export function YourWork({
  projects,
  cfg,
  covers,
}: {
  projects: Project[];
  cfg: RequestConfig;
  covers: Map<string, string>;
}) {
  const shoots = projects.filter((p) => p.type === "shoot");
  const cats: Cat[] = [
    ...(cfg.shoots
      ? [
          {
            key: "property",
            name: "Property shoots",
            icon: "photo",
            href: TYPE_PATH.shoot,
            items: shoots.filter(isProperty),
          },
          {
            key: "video",
            name: "Video shoots",
            icon: "video",
            href: TYPE_PATH.shoot,
            items: shoots.filter((p) => !isProperty(p)),
          },
        ]
      : []),
    ...(cfg.editing
      ? [
          {
            key: "edit",
            name: "Editing",
            icon: "editing",
            href: TYPE_PATH.edit,
            items: projects.filter((p) => p.type === "edit"),
          },
        ]
      : []),
    ...(cfg.avatars
      ? [
          {
            key: "avatar",
            name: "AI avatars",
            icon: "ai",
            href: TYPE_PATH.avatar,
            items: projects.filter((p) => p.type === "avatar"),
          },
        ]
      : []),
  ].filter((c) => c.items.length > 0);

  if (!cats.length)
    return (
      <section className="pt-card" aria-labelledby="work">
        <h2 id="work" className="pt-h2">
          Your work
        </h2>
        <p className="pt-meta" style={{ margin: 0 }}>
          Nothing yet. Book a shoot, send files to edit or brief an AI avatar video, and follow it
          here.
        </p>
        <span>
          <StartRequests cfg={cfg} />
        </span>
      </section>
    );

  return (
    <section className="pt-work" aria-labelledby="work" data-testid="your-work">
      <h2 id="work" className="pt-h2">
        Your work
      </h2>
      {cats.map((c) => {
        const live = c.items.filter(active);
        // In progress first; with nothing open, the latest finished one keeps the group useful.
        const shown = (live.length ? live : c.items).slice(0, 4);
        return (
          <div key={c.key} className="pt-work-group" data-testid={`work-${c.key}`}>
            <div className="pt-row">
              <span className="pt-eb">
                {c.name} · {live.length} active
              </span>
              <Link href={c.href} className="lnk pt-small" prefetch={false}>
                View all
              </Link>
            </div>
            <ul className="pt-work-items">
              {shown.map((p) => {
                const cover = covers.get(p.id);
                const when =
                  p.type === "shoot" && p.shoot_date ? shootDay(p.shoot_date) : day(p.created_at);
                return (
                  <li key={p.id}>
                    <Link
                      href={`${TYPE_PATH[p.type]}/${encodeURIComponent(p.ref)}`}
                      prefetch={false}
                      className="pt-wrow"
                    >
                      <span className="pt-wthumb">
                        {cover ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={cover} alt="" loading="lazy" />
                        ) : (
                          <Icon name={c.icon} size={22} />
                        )}
                      </span>
                      <span className="pt-wbody">
                        <b className="pt-title">{p.title}</b>
                        <span className="pt-meta">
                          {[p.ref, when, service(p)].filter(Boolean).join(" · ")}
                        </span>
                        <Steps p={p} />
                      </span>
                      <span className="pt-wside">
                        <span className="pt-wstatus">{statusText(p)}</span>
                        <span className="lnk pt-small">Open →</span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </section>
  );
}
