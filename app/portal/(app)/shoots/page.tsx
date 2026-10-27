import Link from "next/link";
import { projectWhen } from "@/lib/portal/when";
import { Icon } from "@/components/portal/Icon";
import { LiveRefresh } from "@/components/portal/LiveRefresh";
import { DraftsRow, StartRequests } from "@/components/portal/StartRequests";
import { Badge, Stepper } from "@/components/portal/ui";
import { requireAccount } from "@/lib/portal/auth";
import {
  clientStatus,
  myProjects,
  SHOOT_SERVICE_LABEL,
  shortTitle,
  statusLabel,
  stepsFor,
} from "@/lib/portal/projects";
import { can } from "@/lib/portal/access";
import { myDrafts } from "@/lib/portal/draft-actions";
import { projectCovers } from "@/lib/portal/covers";
import { requestConfig } from "@/lib/portal/requests";
import { seesMoney } from "@/lib/portal/shell";

export const metadata = { title: "Shoots" };

/** Shoots (§5.2; V2 reskin, 25 Oct 2026): Active / Completed tabs, a card per shoot with its photo,
 *  stage tracker, Files and Manage. Live. */
export default async function Shoots({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const tab = (await searchParams).tab === "completed" ? "completed" : "active";
  const { db, user, current } = await requireAccount("/portal/shoots");
  if (!can(current, "shoots"))
    return (
      <div className="pt-card">
        <b>Your access doesn’t include shoots</b>
        <span className="pt-meta">Ask the account owner if you need it.</span>
      </div>
    );
  const [all, cfg, drafts] = await Promise.all([
    myProjects(db, current.account.id, "shoot", user.id),
    requestConfig(db, current),
    myDrafts(),
  ]);
  const active = all.filter((p) => p.status !== "completed" && p.status !== "cancelled");
  const done = all.filter((p) => p.status === "completed" || p.status === "cancelled");
  // Covers and prices don't depend on each other: one round trip, not two.
  const [covers, { data: items }] = await Promise.all([
    projectCovers(
      db,
      all.filter((p) => p.delivered_at || p.status === "delivered").map((p) => p.id),
    ),
    // Prices: only for those who see billing (the database returns no line items to others).
    seesMoney(current) && all.length
      ? db
          .from("line_items")
          .select("project_id, qty, unit_price, currency")
          .in(
            "project_id",
            all.map((p) => p.id),
          )
      : Promise.resolve({ data: null }),
  ]);
  const price = new Map<string, string>();
  const sums = new Map<string, { t: number; c: string }>();
  for (const i of items ?? []) {
    const s = sums.get(i.project_id) ?? { t: 0, c: i.currency };
    s.t += Number(i.qty) * Number(i.unit_price);
    sums.set(i.project_id, s);
  }
  for (const [id, s] of sums) price.set(id, `${s.c} ${s.t.toLocaleString("en-US")}`);

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
        hrefs={{ booking: "/portal/book?draft=1" }}
      />
      {all.length === 0 && (
        <div className="pt-card">
          <span className="pt-meta">No shoots yet. Book one and track it here.</span>
        </div>
      )}

      {all.length > 0 && (
        <nav className="pt-tabs" aria-label="Shoots">
          <Link href="/portal/shoots" aria-selected={tab === "active"} scroll={false}>
            Active ({active.length})
          </Link>
          <Link
            href="/portal/shoots?tab=completed"
            aria-selected={tab === "completed"}
            scroll={false}
          >
            Completed ({done.length})
          </Link>
        </nav>
      )}

      {all.length > 0 && (tab === "active" ? active : done).length === 0 && (
        <div className="pt-card">
          <span className="pt-meta">
            {tab === "active"
              ? "No active shoots. Book one and track it here."
              : "Nothing completed yet."}
          </span>
        </div>
      )}

      {(tab === "active" ? active : done).length > 0 && (
        <div className="pt-scards" data-testid={tab === "active" ? "shoots" : "completed"}>
          {(tab === "active" ? active : done).map((p) => {
            const to = `/portal/shoots/${encodeURIComponent(p.ref)}`;
            const cover = covers.get(p.id);
            // A thumbnail from Delivered on (owner, 25 Oct 2026); full width until then.
            const delivered =
              !!p.delivered_at || p.status === "delivered" || p.status === "completed";
            return (
              <article key={p.id} className="pt-scard" data-thumb={delivered ? "" : undefined}>
                {delivered && (
                  <Link href={to} className="pt-scard-thumb" tabIndex={-1} aria-hidden="true">
                    {cover ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={cover} alt="" loading="lazy" />
                    ) : (
                      <span className="pt-hero-ph">
                        <Icon name="shoots" />
                      </span>
                    )}
                  </Link>
                )}
                <div className="pt-scard-body">
                  <div className="pt-row">
                    <span className="pt-eb" style={{ whiteSpace: "nowrap" }}>
                      {p.ref}
                    </span>
                    <Badge tone={p.status === "delivered" ? "gold" : undefined}>
                      {clientStatus(p)}
                    </Badge>
                  </div>
                  <div style={{ display: "grid", gap: 2 }}>
                    <Link href={to} className="pt-scard-title">
                      <b className="pt-title">
                        {shortTitle(p.title)}
                        {p.meta.unit ? ` · ${p.meta.unit}` : ""}
                      </b>
                    </Link>
                    <span className="pt-meta">
                      {[p.meta.area, projectWhen(p)].filter(Boolean).join(" · ")}
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
                  {p.status !== "cancelled" && (
                    <Stepper steps={stepsFor("shoot")} now={statusLabel(p.status)} />
                  )}
                  {p.status === "requested" && !p.meta.attached_by_email && (
                    <span className="pt-meta">
                      We confirm the date and slot by email, usually within a few hours.
                    </span>
                  )}
                  <div className="pt-scard-btns">
                    {(p.delivered_at || p.status === "delivered" || p.status === "completed") && (
                      <Link href={`${to}#files`} className="btn btn-p btn-s">
                        <Icon name="download" size={16} /> Files
                      </Link>
                    )}
                    <Link href={to} className="btn btn-g btn-s">
                      Manage
                    </Link>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </>
  );
}
