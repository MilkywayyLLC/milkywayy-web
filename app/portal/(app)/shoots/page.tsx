import Link from "next/link";
import { Icon } from "@/components/portal/Icon";
import { LiveRefresh } from "@/components/portal/LiveRefresh";
import { DraftsRow, StartRequests } from "@/components/portal/StartRequests";
import { Badge, Stepper } from "@/components/portal/ui";
import { requireAccount } from "@/lib/portal/auth";
import {
  clientStatus,
  myProjects,
  SHOOT_SERVICE_LABEL,
  shootDay,
  statusLabel,
  stepsFor,
} from "@/lib/portal/projects";
import { can } from "@/lib/portal/access";
import { myDrafts } from "@/lib/portal/draft-actions";
import { requestConfig } from "@/lib/portal/requests";
import { seesMoney } from "@/lib/portal/shell";

export const metadata = { title: "Shoots" };

/** Shoots (§5.2): every shoot with its stepper; completed ones below. Live. */
export default async function Shoots() {
  const { db, current } = await requireAccount("/portal/shoots");
  if (!can(current, "shoots"))
    return (
      <div className="pt-card">
        <b>Your access doesn’t include shoots</b>
        <span className="pt-meta">Ask the account owner if you need it.</span>
      </div>
    );
  const [all, cfg, drafts] = await Promise.all([
    myProjects(db, current.account.id, "shoot"),
    requestConfig(db, current),
    myDrafts(),
  ]);
  const active = all.filter((p) => p.status !== "completed" && p.status !== "cancelled");
  const done = all.filter((p) => p.status === "completed" || p.status === "cancelled");
  // Prices: only for those who see billing (the database returns no line items to others).
  const price = new Map<string, string>();
  if (seesMoney(current) && all.length) {
    const { data } = await db
      .from("line_items")
      .select("project_id, qty, unit_price, currency")
      .in(
        "project_id",
        all.map((p) => p.id),
      );
    const sums = new Map<string, { t: number; c: string }>();
    for (const i of data ?? []) {
      const s = sums.get(i.project_id) ?? { t: 0, c: i.currency };
      s.t += Number(i.qty) * Number(i.unit_price);
      sums.set(i.project_id, s);
    }
    for (const [id, s] of sums) price.set(id, `${s.c} ${s.t.toLocaleString("en-US")}`);
  }

  return (
    <>
      <LiveRefresh />
      <div className="pt-head">
        <div>
          <span className="pt-eb">
            {active.length} active
            {!can(current, "all_projects") ? " · yours" : ""}
          </span>
          <h1 className="pt-h1">Shoots</h1>
        </div>
        <StartRequests cfg={cfg} only="booking" />
      </div>

      <DraftsRow
        drafts={drafts.filter((d) => d.kind === "booking")}
        hrefs={{ booking: "/portal/shoots?new=booking&draft=1" }}
      />
      {all.length === 0 && (
        <div className="pt-card">
          <span className="pt-meta">No shoots yet. Book one and track it here.</span>
        </div>
      )}

      {active.length > 0 && (
        <div className="pt-grid2" data-testid="shoots">
          {active.map((p) => (
            <Link
              key={p.id}
              href={`/portal/shoots/${encodeURIComponent(p.ref)}`}
              className="pt-card pt-card-link"
            >
              <div className="pt-row">
                <span className="pt-eb" style={{ whiteSpace: "nowrap" }}>
                  {p.ref}
                </span>
                <Badge tone={p.status === "delivered" ? "gold" : undefined}>
                  {clientStatus(p)}
                </Badge>
              </div>
              <div style={{ display: "grid", gap: 2 }}>
                <b className="pt-title">
                  {p.title}
                  {p.meta.unit ? ` · ${p.meta.unit}` : ""}
                </b>
                <span className="pt-meta">
                  {[p.meta.area, shootDay(p.shoot_date), p.slot].filter(Boolean).join(" · ")}
                </span>
                <span className="pt-meta">
                  {[
                    ...(p.meta.services ?? []).map((s) => SHOOT_SERVICE_LABEL[s] ?? s),
                    price.get(p.id),
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </div>
              <Stepper steps={stepsFor("shoot")} now={statusLabel(p.status)} />
              {p.status === "requested" && !p.meta.attached_by_email && (
                <span className="pt-meta">
                  We confirm the date and slot by email, usually within a few hours.
                </span>
              )}
            </Link>
          ))}
        </div>
      )}

      {done.length > 0 && (
        <section style={{ display: "grid", gap: 10 }}>
          <h2 className="pt-h2">Completed</h2>
          <div className="pt-list" data-testid="completed">
            {done.map((p) => (
              <Link
                key={p.id}
                href={`/portal/shoots/${encodeURIComponent(p.ref)}`}
                className="pt-row"
                style={{ textDecoration: "none" }}
              >
                <div>
                  <b className="pt-title">{p.title}</b>
                  <div className="pt-meta">
                    {p.ref} · {shootDay(p.shoot_date)}
                    {p.completed_at
                      ? ` · completed ${new Date(p.completed_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`
                      : ""}
                  </div>
                </div>
                <Icon name="chevron" size={16} />
              </Link>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
