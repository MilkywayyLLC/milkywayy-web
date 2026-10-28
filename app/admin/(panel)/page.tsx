import { headers } from "next/headers";
import Link from "next/link";
import { unstable_rethrow } from "next/navigation";
import { PackagesThisMonth, type PlanSummaryRow } from "@/components/admin/PackagesThisMonth";
import { Pill } from "@/components/admin/Pill";
import { ProposeTime } from "@/components/admin/PaymentAdmin";
import { StatusButtons } from "@/components/admin/ProjectStatus";
import { RefreshSite } from "@/components/admin/RefreshSite";
import { requireAdmin, TEST_ACCOUNTS } from "@/lib/admin/auth";
import { dubai } from "@/lib/admin/format";
import { LEAD_TYPES } from "@/lib/admin/leads";
import { portalAdminPage, portalAdminReady, type ProjectListRow } from "@/lib/portal/admin";
import { money } from "@/lib/portal/billing";
import { originFrom } from "@/lib/portal/invite";
import {
  addDays,
  areaOf,
  daysSince,
  dubaiDay,
  nextAction,
  toStatusTarget,
} from "@/lib/portal/next-action";
import { adminStatuses, statusLabel, TYPE_LABEL, type ProjectType } from "@/lib/portal/projects";
import { dayLabel, projectStart } from "@/lib/portal/when";

export const metadata = { title: "Today" };

type Row = ProjectListRow & { sort_at?: string };
type QueueRow = {
  id: string;
  account_name: string;
  number: string | null;
  amount: number;
  currency: string;
  status: string;
  shown_status: string;
  due_on: string;
  payment_state: "submitted" | "rejected" | null;
};
type Inquiry = {
  id: string;
  subject: string;
  admin_unread: boolean;
  last_message_at: string;
  account_name: string;
};
type Revenue = { currency: string; total: number; refunded: number; count: number }[];

const preview = (p: string) => `/admin/preview?path=${encodeURIComponent(p)}`;
const DRAFT_LINKS: Record<string, [string, string]> = {
  pricing_property: ["Website prices", "/admin/pricing"],
  pricing_other: ["Other website prices", "/admin/pricing/other"],
  site: ["Site settings", "/admin/settings"],
  avatar_hero: ["AI avatars hero", "/admin/avatar-hero"],
};
const TYPES: ProjectType[] = ["shoot", "edit", "avatar"];

/** Sum per currency: "AED 4,500 · USD 300". */
const sums = (rows: { currency: string; amount: number }[]) => {
  const m = new Map<string, number>();
  for (const r of rows) m.set(r.currency, (m.get(r.currency) ?? 0) + Number(r.amount));
  return [...m].map(([c, v]) => money(c, v)).join(" · ") || "—";
};

/**
 * Admin → Today (admin redesign, 27 Oct 2026): the day's operations at a glance for the Owner,
 * built only from queries that already exist (plus the read-only revenue total). Each source can
 * fail on its own; its card then says so and the rest still loads. Editors keep the content view.
 */
export default async function Today({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const { db, role } = await requireAdmin();
  const params = await searchParams;
  const owner = role === "owner";
  const ready = owner && portalAdminReady();
  const rpc = ready ? await portalAdminPage() : null;
  const safe = async <T,>(p: Promise<T>): Promise<T | null> => {
    try {
      return await p;
    } catch (e) {
      unstable_rethrow(e); // the refused-key redirect
      return null;
    }
  };

  const [rows, queue, inquiries, revenue, settings, leads, changes, drafts, plans] =
    await Promise.all([
      // One call for every type: the RPC syncs bookings on each call.
      rpc ? safe(rpc<Row[]>("portal_admin_projects", {})) : null,
      rpc ? safe(rpc<QueueRow[]>("portal_admin_invoice_queue", { p_status: null })) : null,
      rpc ? safe(rpc<Inquiry[]>("portal_admin_inquiries", { p_status: null })) : null,
      rpc ? safe(rpc<Revenue>("portal_admin_revenue", {})) : null,
      rpc ? safe(rpc<Record<string, unknown>>("portal_admin_billing_settings", {})) : null,
      owner
        ? db
            .from("leads")
            .select("ref, type, name, created_at, status")
            .eq("status", "new")
            .order("created_at", { ascending: false })
            .limit(20)
        : null,
      db
        .from("change_log")
        .select("at, admin_email, summary")
        .not("admin_email", "like", TEST_ACCOUNTS)
        .order("at", { ascending: false })
        .limit(8),
      db.from("drafts").select("key, updated_at"),
      rpc ? safe(rpc<PlanSummaryRow[]>("portal_admin_plan_summaries", {})) : null,
    ]);

  const origin = originFrom(await headers());
  const now = new Date();
  const today = dubaiDay(now);
  const weekEnd = addDays(today, 6);
  const all = rows ?? [];
  const live = all.filter((r) => r.status !== "cancelled" && r.status !== "completed");
  const requested = live.filter((r) => r.type === "shoot" && r.status === "requested");
  const week = live
    .filter(
      (r) =>
        r.type === "shoot" &&
        r.status === "confirmed" &&
        r.shoot_date &&
        r.shoot_date >= today &&
        r.shoot_date <= weekEnd,
    )
    .sort((a, b) =>
      `${a.shoot_date}${projectStart(a) ?? ""}`.localeCompare(
        `${b.shoot_date}${projectStart(b) ?? ""}`,
      ),
    );
  const delivered = live.filter(
    (r) => r.status === "delivered" && !r.revision_state?.match(/requested|in_progress/),
  );
  const revisions = live.filter(
    (r) => r.revision_state === "requested" || r.revision_state === "in_progress",
  );
  const q = queue ?? [];
  const drafts2approve = q.filter((r) => r.status === "draft");
  const receipts = q.filter((r) => r.payment_state === "submitted" && r.status !== "paid");
  const outstanding = q.filter((r) => r.status === "due" || r.status === "overdue");
  const overdue = outstanding.filter((r) => r.shown_status === "overdue" || r.status === "overdue");
  const unread = (inquiries ?? []).filter((i) => i.admin_unread);
  // A website booking is a lead and a project: list it once, as the project.
  const isProject = (ref: string) => all.some((r) => r.ref === ref || r.ref.startsWith(`${ref}-`));
  const newLeads = (leads?.data ?? []).filter((l) => !isProject(l.ref));
  // TRN only matters once VAT registered.
  const missing = settings
    ? ["company_name", "bank_iban", ...(settings.vat_registered ? ["company_trn"] : [])].filter(
        (k) => !settings[k],
      )
    : [];

  const actions: [number, string, string][] = [
    [
      requested.filter((r) => !r.meta.proposal).length,
      "to confirm",
      "/admin/projects?status=requested",
    ],
    [receipts.length, "receipts to check", "/admin/billing?status=submitted"],
    [drafts2approve.length, "invoice drafts", "/admin/billing?status=open"],
    [
      revisions.filter((r) => r.revision_state === "requested").length,
      "revisions asked",
      "/admin/projects?type=all&chip=me",
    ],
    [overdue.length, "overdue invoices", "/admin/billing?status=overdue"],
    [unread.length, "unread messages", "/admin/inquiries"],
    [newLeads.length, "new leads", "/admin/leads?status=new"],
  ];

  // Recent client activity: what clients did, newest first (bookings, approvals, revisions,
  // messages, receipts), from the rows above.
  const feed = [
    ...all
      .filter((r) => daysSince(r.created_at, now) <= 14)
      .map((r) => ({
        at: r.created_at,
        text: `${r.type === "shoot" ? "New booking" : `New ${TYPE_LABEL[r.type].toLowerCase()}`} · ${r.ref} · ${r.account_name ?? r.client_name ?? ""}`,
        href: `/admin/projects/${r.id}`,
      })),
    ...all
      .filter((r) => r.completed_at && daysSince(r.completed_at, now) <= 14)
      .map((r) => ({
        at: r.completed_at!,
        text: `Delivery approved · ${r.ref} · ${r.account_name ?? r.client_name ?? ""}`,
        href: `/admin/projects/${r.id}`,
      })),
    ...revisions.map((r) => ({
      at: r.sort_at ?? r.created_at,
      text: `Revision ${r.revision_state === "requested" ? "asked" : "in progress"} · ${r.ref}`,
      href: `/admin/projects/${r.id}`,
    })),
    ...(inquiries ?? []).slice(0, 10).map((i) => ({
      at: i.last_message_at,
      text: `Message · ${i.subject} · ${i.account_name}`,
      href: `/admin/inquiries/${i.id}`,
    })),
  ]
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 10);

  const unavailable = <p className="ad-empty">Couldn’t load this right now.</p>;

  return (
    <div className="ad-page">
      <div className="ad-head">
        <div>
          <span className="ad-eb">{dayLabel(today)}</span>
          <h1 className="ad-h1">Today</h1>
        </div>
        <a className="ad-btn ghost" href={preview("/")} target="_blank" rel="noopener">
          Preview the site
        </a>
      </div>
      {params["owner-only"] && <p className="ad-note warn">That section is for the Owner.</p>}
      {params["portal-key"] && (
        <p className="ad-note warn">
          Portal sections are locked: the admin key on this deployment doesn’t match.{" "}
          <span className="ad-muted">Fix: reset it with the admin-secret script (LAUNCH.md).</span>
        </p>
      )}
      {owner && !portalAdminReady() && (
        <p className="ad-note warn">Portal sections are off on this deployment (no admin key).</p>
      )}
      {missing.length > 0 && (
        <p className="ad-note warn">
          Invoices are missing company details.{" "}
          <Link href="/admin/billing/settings">Fill in Business &amp; billing</Link>
        </p>
      )}
      {!!drafts.data?.length && (
        <p className="ad-note">
          Unpublished drafts:{" "}
          {drafts.data.map((d, i) => (
            <span key={d.key}>
              {i > 0 && " · "}
              <Link href={DRAFT_LINKS[d.key]?.[1] ?? "/admin"}>
                {DRAFT_LINKS[d.key]?.[0] ?? d.key}
              </Link>
            </span>
          ))}
        </p>
      )}

      {ready && (
        <>
          <nav className="ad-actions" aria-label="Action items">
            {actions.map(([n, label, href]) => (
              <Link key={label} href={href} prefetch={false} className={n ? "on" : ""}>
                <b>{n}</b>
                <span>{label}</span>
              </Link>
            ))}
          </nav>

          <section className="ad-card" aria-label="Pending confirmations">
            <div className="ad-row-between">
              <h2 className="ad-h2">Pending confirmations</h2>
              <span className="ad-eb">{requested.length}</span>
            </div>
            {rows == null ? (
              unavailable
            ) : requested.length ? (
              <div className="ad-list">
                {requested.map((r) => (
                  <div key={r.id} className="ad-row ad-today-row">
                    <Link href={`/admin/projects/${r.id}`} className="ad-row-main" prefetch={false}>
                      <span>
                        <span className="ad-row-title">
                          {r.ref} · {areaOf(r)}
                        </span>
                        <span className="ad-row-meta ad-block">
                          {[
                            r.account_name ?? r.client_name ?? "Not claimed yet",
                            r.shoot_date
                              ? `${dayLabel(r.shoot_date)}${projectStart(r) ? ` · ${projectStart(r)}` : ""}`
                              : "",
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      </span>
                    </Link>
                    {r.meta.paid_at && <Pill tone="ok">Paid</Pill>}
                    {r.meta.proposal ? (
                      <Pill tone="neutral">
                        Proposed {dayLabel(r.meta.proposal.date)} · {r.meta.proposal.start_time}
                      </Pill>
                    ) : null}
                    <div className="ad-btns">
                      <StatusButtons
                        project={toStatusTarget(r)}
                        options={["confirmed"]}
                        origin={origin}
                      />
                      <ProposeTime
                        compact
                        projectId={r.id}
                        proposal={r.meta.proposal ?? null}
                        paid={!!r.meta.paid_at}
                      />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="ad-empty">Nothing waiting.</p>
            )}
          </section>

          <section className="ad-card" aria-label="Shoots this week">
            <div className="ad-row-between">
              <h2 className="ad-h2">Shoots · today and this week</h2>
              <Link className="ad-btn quiet small" href="/admin/projects/calendar" prefetch={false}>
                Calendar
              </Link>
            </div>
            {rows == null ? (
              unavailable
            ) : week.length ? (
              <div className="ad-list">
                {week.map((r) => (
                  <Link
                    key={r.id}
                    href={`/admin/projects/${r.id}`}
                    className="ad-row ad-today-row"
                    prefetch={false}
                  >
                    <span className="ad-today-when">
                      <b>{r.shoot_date === today ? "Today" : dayLabel(r.shoot_date)}</b>
                      <span className="ad-mono">{projectStart(r) ?? "—"}</span>
                    </span>
                    <span className="ad-row-main">
                      <span>
                        <span className="ad-row-title">{areaOf(r)}</span>
                        <span className="ad-row-meta ad-block">
                          {r.ref} · {r.account_name ?? r.client_name ?? "Not claimed yet"}
                        </span>
                      </span>
                    </span>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="ad-empty">No confirmed shoots this week.</p>
            )}
          </section>

          <div className="ad-grid2">
            <section className="ad-card" aria-label="Projects by stage">
              <h2 className="ad-h2">Projects by stage</h2>
              {rows == null
                ? unavailable
                : TYPES.map((t) => {
                    const mine = live.filter((r) => r.type === t);
                    return (
                      <div key={t} className="ad-stack-8">
                        <span className="ad-eb">
                          {TYPE_LABEL[t]} · {mine.length}
                        </span>
                        <div className="ad-btns ad-chips">
                          {adminStatuses(t)
                            .filter((s) => s !== "completed" && s !== "cancelled")
                            .map((s) => {
                              const n = mine.filter((r) => r.status === s).length;
                              return (
                                <Link
                                  key={s}
                                  href={`/admin/projects?type=${t}&status=${s}`}
                                  prefetch={false}
                                  className="ad-stage"
                                >
                                  <Pill status={n ? s : undefined}>
                                    {statusLabel(s)} {n}
                                  </Pill>
                                </Link>
                              );
                            })}
                        </div>
                      </div>
                    );
                  })}
            </section>

            <section className="ad-card" aria-label="Deliveries">
              <h2 className="ad-h2">Deliveries</h2>
              {rows == null ? (
                unavailable
              ) : revisions.length + delivered.length ? (
                <div className="ad-list">
                  {[...revisions, ...delivered].map((r) => (
                    <Link
                      key={r.id}
                      href={`/admin/projects/${r.id}`}
                      className="ad-row ad-today-row"
                      prefetch={false}
                    >
                      <span className="ad-row-main">
                        <span>
                          <span className="ad-row-title">
                            {r.ref} · {r.account_name ?? r.client_name ?? ""}
                          </span>
                          <span className="ad-row-meta ad-block">{nextAction(r, now).text}</span>
                        </span>
                      </span>
                      <Pill tone={r.revision_state ? "warn" : "ok"}>
                        {r.revision_state ? "Revision" : "Awaiting approval"}
                      </Pill>
                    </Link>
                  ))}
                </div>
              ) : (
                <p className="ad-empty">Nothing waiting on approval or revision.</p>
              )}
            </section>
          </div>

          <div className="ad-grid2">
            <section className="ad-card" aria-label="Money">
              <h2 className="ad-h2">Money</h2>
              <div className="ad-stats">
                <div className="ad-stat">
                  <span className="ad-eb">Revenue this month</span>
                  <b>
                    {revenue == null
                      ? "—"
                      : sums(revenue.map((r) => ({ currency: r.currency, amount: r.total })))}
                  </b>
                  {!!revenue?.some((r) => Number(r.refunded) > 0) && (
                    <span className="ad-small ad-muted">
                      Refunded{" "}
                      {sums(revenue.map((r) => ({ currency: r.currency, amount: r.refunded })))}
                    </span>
                  )}
                </div>
                <div className="ad-stat">
                  <span className="ad-eb">Outstanding</span>
                  <b>{queue == null ? "—" : sums(outstanding)}</b>
                  <span className="ad-small ad-muted">{outstanding.length} invoices</span>
                </div>
              </div>
              {overdue.length > 0 && (
                <div className="ad-list">
                  {overdue.map((r) => (
                    <Link
                      key={r.id}
                      href={`/admin/billing/invoices/${r.id}`}
                      className="ad-row ad-today-row"
                      prefetch={false}
                    >
                      <span className="ad-row-main">
                        <span>
                          <span className="ad-row-title">
                            {r.account_name} · {money(r.currency, Number(r.amount))}
                          </span>
                          <span className="ad-row-meta ad-block">
                            {r.number ?? "Draft"} · due {dayLabel(r.due_on)} ·{" "}
                            {daysSince(`${r.due_on}T00:00:00+04:00`, now)} days late
                          </span>
                        </span>
                      </span>
                      <Pill tone="danger">Overdue</Pill>
                    </Link>
                  ))}
                </div>
              )}
            </section>
            <PackagesThisMonth rows={plans} />

            <section className="ad-card" aria-label="Recent client activity">
              <h2 className="ad-h2">Recent client activity</h2>
              {feed.length ? (
                <ul className="ad-feed">
                  {feed.map((f, i) => (
                    <li key={i}>
                      <Link href={f.href} prefetch={false}>
                        {f.text}
                      </Link>
                      <span className="ad-muted ad-mono">{dubai(f.at)}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="ad-empty">Quiet for the last two weeks.</p>
              )}
              {newLeads.length > 0 && (
                <>
                  <h3 className="ad-h3">New leads</h3>
                  <ul className="ad-feed">
                    {newLeads.slice(0, 5).map((l) => (
                      <li key={l.ref}>
                        <Link href={`/admin/leads/${l.ref}`} prefetch={false}>
                          {l.name || "No name"} · {LEAD_TYPES[l.type] ?? l.type}
                        </Link>
                        <span className="ad-muted ad-mono">{dubai(l.created_at)}</span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </section>
          </div>
        </>
      )}

      <details className="ad-card" open={!owner || undefined}>
        <summary className="ad-h2">Website</summary>
        <div className="ad-stack-12">
          {changes.data?.length ? (
            <ul className="ad-feed">
              {changes.data.map((c, i) => (
                <li key={i}>
                  <span>{c.summary}</span>
                  <span className="ad-muted ad-mono">
                    {dubai(c.at)} · {c.admin_email}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="ad-empty">Nothing changed yet.</p>
          )}
          <div className="ad-btns">
            <Link className="ad-btn ghost small" href="/admin/portfolio/new">
              Add portfolio item
            </Link>
            <Link className="ad-btn ghost small" href="/admin/reviews/new">
              Add a review
            </Link>
            <Link className="ad-btn ghost small" href="/admin/faqs">
              FAQs
            </Link>
          </div>
          <RefreshSite />
        </div>
      </details>
    </div>
  );
}
