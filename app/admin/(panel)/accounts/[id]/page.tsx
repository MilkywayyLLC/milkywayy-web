import Link from "next/link";
import {
  BillingSwitches,
  BudgetPanel,
  ClientRateHistory,
  type BillingHistory,
} from "@/components/admin/BudgetTools";
import { notFound } from "next/navigation";
import {
  CancelInvite,
  ResendInvite,
  ClientEditor,
  ClientInviteForm,
  RetentionSelect,
} from "@/components/admin/ClientAccountTools";
import {
  ClientOffer,
  HideSuggestions,
  OfferPreview,
  PlanForm,
  Statements,
  type ClientBilling,
  type InvoiceRowData,
} from "@/components/admin/BillingTools";
import { dateLabel, money } from "@/lib/portal/billing";
import { AttachBooking, MemberPhone } from "@/components/admin/ClientProjectTools";
import { dubai } from "@/lib/admin/format";
import { portalAdminPage, type ClientDetail } from "@/lib/portal/admin";
import { day, propertyTitle, SHOOT_SERVICES } from "@/lib/portal/bookings";
import { industryLabel, serviceLabel } from "@/lib/portal/options";

export const metadata = { title: "Client" };

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ created?: string; emailed?: string }>;
};

const ROLE: Record<string, string> = { owner: "Owner", admin: "Admin", member: "Member" };
const ACTION: Record<string, string> = {
  view: "Opened",
  view_as: "Viewed as client",
  create: "Created",
  update: "Updated",
  invite: "Invited",
  cancel_invite: "Cancelled invite",
};

export default async function ClientPage({ params, searchParams }: Props) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const rpc = await portalAdminPage();
  const [c, billing, invoices, openInvites, history] = await Promise.all([
    rpc<ClientDetail | null>("portal_admin_client", { p_id: id, p_view_as: false }),
    rpc<ClientBilling>("portal_admin_client_billing", { p_account: id }),
    rpc<InvoiceRowData[]>("portal_admin_invoices", { p_account: id }),
    rpc<{ id: string; last_sent_at: string | null }[]>("portal_admin_open_invites", {
      p_account: id,
    }),
    rpc<BillingHistory>("portal_admin_billing_history", { p_account: id }),
  ]);
  const sentAt = new Map(openInvites.map((i) => [i.id, i.last_sent_at]));
  if (!c) notFound();
  const a = c.account;
  const { created, emailed } = await searchParams;

  return (
    <div className="ad-page">
      <div className="ad-head">
        <div>
          <Link className="ad-eb" href="/admin/accounts" prefetch={false}>
            ← Client accounts
          </Link>
          <h1 className="ad-h1">{a.name}</h1>
          <span className="ad-small ad-muted">
            {a.type === "company"
              ? industryLabel(a.industry, a.industry_other) || "Company"
              : "Individual"}{" "}
            · {a.currency} · since {dubai(a.created_at)}
          </span>
        </div>
        <div className="ad-btns">
          <Link className="ad-btn ghost" href={`/admin/accounts/${a.id}/view`} prefetch={false}>
            View as client
          </Link>
        </div>
      </div>
      {created && (
        <p className="ad-note" role="status">
          Client created.{" "}
          {emailed === "sent"
            ? "“Your Milkywayy portal is ready” is on its way to the Owner."
            : emailed === "skipped"
              ? "The invite email isn’t sent here (no email set up, or a test address)."
              : emailed === "failed"
                ? "The invite email didn’t go out: use Resend invite below."
                : "Send the Owner invite below so they know where to sign in."}
        </p>
      )}

      <div className="ad-grid2">
        <section className="ad-card" aria-label="Details">
          <h2 className="ad-h2">Details</h2>
          <dl className="ad-dl">
            <dt>Services</dt>
            <dd>{a.services_interest.map(serviceLabel).join(", ") || "None chosen"}</dd>
            <dt>Volume</dt>
            <dd>{a.volume_note ?? "—"}</dd>
            <dt>TRN</dt>
            <dd>{a.trn ?? "—"}</dd>
            <dt>Billing address</dt>
            <dd style={{ whiteSpace: "pre-wrap" }}>{a.billing_address ?? "—"}</dd>
            <dt>Members see</dt>
            <dd>
              {a.member_visibility === "all" ? "All company projects" : "Only their own projects"}
            </dd>
          </dl>
          <RetentionSelect accountId={a.id} months={a.retention_months ?? 12} />
        </section>
        <ClientEditor id={a.id} currency={a.currency} notes={c.notes ?? ""} />
      </div>

      <section className="ad-card ad-form" aria-label="Billing" data-testid="client-billing">
        <div className="ad-row-main" style={{ justifyContent: "space-between" }}>
          <h2 className="ad-h2">Billing · {billing.currency}</h2>
          <Link className="ad-btn ghost small" href="/admin/billing" prefetch={false}>
            Invoices ({invoices.length})
          </Link>
          <Link
            className="ad-btn ghost small"
            href={`/admin/listings?account=${a.id}`}
            prefetch={false}
          >
            Share pages
          </Link>
        </div>
        {history.mode === "budget" ? null : billing.plan.package ? (
          <div className="stack" style={{ gap: 8 }}>
            <b>
              {billing.plan.package.name} ·{" "}
              {money(billing.plan.package.currency, billing.plan.package.price)}/month
              {billing.plan.package.prorated
                ? ` · first month pro-rated (${billing.plan.package.days}/${billing.plan.package.month_days} days)`
                : billing.plan.package.term_months === 6
                  ? ` · Month ${billing.plan.package.month_no} of 6${billing.plan.package.ends_on ? `, ends ${dateLabel(billing.plan.package.ends_on)}` : ""}`
                  : ""}{" "}
              · renews {dateLabel(billing.plan.package.renews_on)}
            </b>
            {billing.plan.package.usage.map((u) => (
              <div key={u.key} className="stack" style={{ gap: 4 }}>
                <span className="ad-small">
                  {u.label}: {Number(u.used)} of {Number(u.qty)}
                  {Number(u.over) > 0
                    ? ` · ${Number(u.over)} over (${money(billing.plan.package!.currency, Number(u.overage))})`
                    : ""}
                </span>
                <span className="ad-meter" aria-hidden="true">
                  <i
                    style={{
                      width: `${Math.min(100, (Number(u.used) / Math.max(1, Number(u.qty))) * 100)}%`,
                    }}
                  />
                </span>
              </div>
            ))}
            <span className="ad-small">
              This month, estimated:{" "}
              {money(billing.plan.package.currency, Number(billing.plan.package.estimate))}
            </span>
          </div>
        ) : (
          <span className="ad-small">
            Pay as you go · this month so far {money(billing.currency, billing.payg.total)}{" "}
            (estimate)
            {billing.payg.last_month
              ? ` · last month ${money(billing.currency, Number(billing.payg.last_month.total))}${billing.payg.last_month.final ? " (final)" : ""}`
              : ""}
          </span>
        )}
        <BudgetPanel account={a.id} currency={billing.currency} h={history} />
        <BillingSwitches account={a.id} h={history} />
        <OfferPreview billing={billing} />
        <PlanForm account={a.id} billing={billing} />
        <HideSuggestions account={a.id} hidden={billing.hide_suggestions} />
        <ClientOffer account={a.id} billing={billing} />
        <details>
          <summary className="ad-small">Monthly statements</summary>
          <Statements account={a.id} billing={billing} />
        </details>
        <details>
          <summary className="ad-small">Rates for this client</summary>
          <ClientRateHistory account={a.id} currency={billing.currency} h={history} />
        </details>
        <Link className="ad-small" href="/admin/billing/packages" prefetch={false}>
          Create a private package for this client →
        </Link>
      </section>

      <section className="ad-card ad-form" aria-label="Projects">
        <h2 className="ad-h2">Projects</h2>
        <div className="ad-btns">
          <Link
            className="ad-btn small"
            href={`/admin/projects/new?account=${a.id}`}
            prefetch={false}
          >
            New project for this client
          </Link>
          <Link
            className="ad-btn ghost small"
            href={`/admin/accounts/${a.id}/past`}
            prefetch={false}
          >
            Add past project
          </Link>
          <Link
            className="ad-btn ghost small"
            href={`/admin/projects?q=${encodeURIComponent(a.name)}&view=list`}
            prefetch={false}
          >
            Their projects
          </Link>
        </div>
        <AttachBooking account={a.id} />
      </section>

      <section className="ad-card" aria-label="Members">
        <h2 className="ad-h2">Members</h2>
        {c.members.length ? (
          <div className="ad-list" data-testid="members">
            {c.members.map((m) => (
              <div key={m.user_id} className="ad-row ad-lead" style={{ alignItems: "start" }}>
                <span className={`ad-pill ${m.role === "owner" ? "live" : "draft"}`}>
                  {ROLE[m.role]}
                </span>
                <span className="ad-row-main">
                  <span>
                    <span className="ad-row-title">{m.name ?? m.email ?? m.phone}</span>
                    <span className="ad-row-meta" style={{ display: "block" }}>
                      {[m.email, m.phone].filter(Boolean).join(" · ")} · joined {dubai(m.joined)}
                      {m.last_sign_in ? ` · last sign-in ${dubai(m.last_sign_in)}` : ""}
                    </span>
                  </span>
                </span>
                <MemberPhone
                  account={a.id}
                  user={m.user_id}
                  phone={m.phone}
                  name={m.name ?? m.email ?? "this member"}
                />
              </div>
            ))}
          </div>
        ) : (
          <p className="ad-empty">Nobody has joined yet.</p>
        )}
        {c.invites.length > 0 && (
          <>
            <h3 className="ad-h2" style={{ fontSize: 15 }}>
              Invited, not joined yet
            </h3>
            <div className="ad-list" data-testid="invites">
              {c.invites.map((i) => (
                <div key={i.id} className="ad-row ad-lead">
                  <span className="ad-pill draft">{ROLE[i.role]}</span>
                  <span className="ad-row-main">
                    <span>
                      <span className="ad-row-title">{i.name ?? i.email ?? i.phone}</span>
                      <span className="ad-row-meta" style={{ display: "block" }}>
                        {[i.email, i.phone].filter(Boolean).join(" · ")} · invited{" "}
                        {dubai(i.created_at)}
                        {sentAt.get(i.id)
                          ? ` · emailed ${dubai(sentAt.get(i.id)!)}`
                          : i.email
                            ? " · not emailed yet"
                            : ""}
                      </span>
                    </span>
                  </span>
                  {i.email && <ResendInvite accountId={a.id} inviteId={i.id} />}
                  <CancelInvite accountId={a.id} inviteId={i.id} />
                </div>
              ))}
            </div>
          </>
        )}
      </section>

      <ClientInviteForm id={a.id} name={a.name} />

      <section className="ad-card" aria-label="Bookings">
        <h2 className="ad-h2">Bookings</h2>
        {c.bookings.length ? (
          <div className="ad-list">
            {c.bookings.map((b) => (
              <Link
                key={b.ref}
                href={`/admin/leads/${b.ref}`}
                className="ad-row ad-lead"
                prefetch={false}
              >
                <span className="ad-pill draft">{b.ref}</span>
                <span className="ad-row-main">
                  <span>
                    <span className="ad-row-title">
                      {b.properties
                        .map((p) => `${propertyTitle({ ...p, line: 0 })}, ${day(p.date)} ${p.slot}`)
                        .join(" + ")}
                    </span>
                    <span className="ad-row-meta" style={{ display: "block" }}>
                      {b.properties
                        .flatMap((p) => p.services.map((s) => SHOOT_SERVICES[s] ?? s))
                        .join(", ")}{" "}
                      · attached by {b.via} {dubai(b.claimed_at)}
                    </span>
                  </span>
                </span>
                <span aria-hidden="true">›</span>
              </Link>
            ))}
          </div>
        ) : (
          <p className="ad-empty">No website bookings attached yet.</p>
        )}
      </section>

      <section className="ad-card" aria-label="Contacts">
        <h2 className="ad-h2">Their listing contacts</h2>
        {c.contacts.length ? (
          <p className="ad-small">
            {c.contacts.map((x) => `${x.name}${x.is_default ? " (default)" : ""}`).join(" · ")}
          </p>
        ) : (
          <p className="ad-empty">None saved.</p>
        )}
      </section>

      <section className="ad-card" aria-label="History">
        <h2 className="ad-h2">Admin history</h2>
        <div className="ad-list" data-testid="history">
          {(c.log ?? []).map((g, i) => (
            <div key={i} className="ad-row ad-lead">
              <span className="ad-row-main">
                <span>
                  <span className="ad-row-title">
                    {ACTION[g.action] ?? g.action}
                    {g.detail ? `: ${g.detail}` : ""}
                  </span>
                  <span className="ad-row-meta" style={{ display: "block" }}>
                    {g.actor} · {dubai(g.at, true)}
                  </span>
                </span>
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
