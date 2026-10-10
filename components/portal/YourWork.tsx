import Link from "next/link";
import type { RequestConfig } from "@/lib/portal/requests";
import {
  clientStatus,
  day,
  PIPELINES,
  shootDay,
  TYPE_PATH,
  type Project,
} from "@/lib/portal/projects";
import { StartRequests } from "./StartRequests";
import { Badge } from "./ui";

type Cat = { key: string; name: string; href: string; items: Project[] };

/** A website booking, or a portal booking with a property in it. */
const isProperty = (p: Project) =>
  !p.meta.booking || p.meta.booking.services.some((s) => s.service === "property");
const active = (p: Project) => p.status !== "completed" && p.status !== "cancelled";

/** A thin bar, one segment per step (6 for shoots, as on the shoot page). */
function MiniSteps({ p }: { p: Project }) {
  const steps = PIPELINES[p.type] as readonly string[];
  const at = p.status === "on_hold" ? 1 : Math.max(0, steps.indexOf(p.status));
  return (
    <span className="pt-mini-steps" aria-hidden="true" style={{ ["--n" as string]: steps.length }}>
      {steps.map((s, i) => (
        <i key={s} className={i < at ? "done" : i === at ? "now" : undefined} />
      ))}
    </span>
  );
}

/**
 * Home → Your work (owner, 10 Oct 2026): one row per kind of work the client has used (property
 * shoots, video shoots, editing, AI avatars), within their access: the active count, the latest
 * three in progress with their status and steps, and View all.
 */
export function YourWork({ projects, cfg }: { projects: Project[]; cfg: RequestConfig }) {
  const shoots = projects.filter((p) => p.type === "shoot");
  const cats: Cat[] = [
    ...(cfg.shoots
      ? [
          {
            key: "property",
            name: "Property shoots",
            href: TYPE_PATH.shoot,
            items: shoots.filter(isProperty),
          },
          {
            key: "video",
            name: "Video shoots",
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
    <section className="pt-card" aria-labelledby="work" data-testid="your-work">
      <h2 id="work" className="pt-h2">
        Your work
      </h2>
      <div className="pt-work">
        {cats.map((c) => {
          const live = c.items.filter(active);
          return (
            <div key={c.key} className="pt-work-row" data-testid={`work-${c.key}`}>
              <div className="pt-row">
                <b>
                  {c.name} <span className="pt-meta">· {live.length} active</span>
                </b>
                <Link href={c.href} className="lnk pt-small" prefetch={false}>
                  View all
                </Link>
              </div>
              {live.length ? (
                <ul className="pt-work-items">
                  {live.slice(0, 3).map((p) => (
                    <li key={p.id}>
                      <Link
                        href={`${TYPE_PATH[p.type]}/${encodeURIComponent(p.ref)}`}
                        prefetch={false}
                      >
                        <span className="pt-work-top">
                          <b className="pt-title">{p.title}</b>
                          <Badge
                            tone={
                              p.status === "delivered" || p.status === "script_ready"
                                ? "gold"
                                : p.status === "on_hold"
                                  ? "warn"
                                  : undefined
                            }
                          >
                            {clientStatus(p)}
                          </Badge>
                        </span>
                        <span className="pt-meta">
                          {p.ref} ·{" "}
                          {p.type === "shoot" && p.shoot_date
                            ? shootDay(p.shoot_date)
                            : day(p.created_at)}
                        </span>
                        <MiniSteps p={p} />
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <span className="pt-meta">Nothing in progress right now.</span>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
