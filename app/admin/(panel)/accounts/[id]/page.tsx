import Link from "next/link";
import "@/app/styles/portal.css";
import { BillingSwitches, BudgetPanel, type BillingHistory } from "@/components/admin/BudgetTools";
import { SaveGroup } from "@/components/admin/SaveGroup";
import { ClientTabs } from "@/components/admin/ClientTabs";
import { Pill } from "@/components/admin/Pill";
import { TERMS_LABEL } from "@/lib/portal/payments";
import {
  PlanBlock,
  PriceList,
  ServicesBlock,
  type ClientSetupData,
} from "@/components/admin/ClientSetup";
import { RolloverSettings, type RolloverView } from "@/components/admin/RolloverSettings";
import { HowTheyPay, type ClientPayments } from "@/components/admin/PaymentAdmin";
import { ValuePackageCard, type ValueMonth } from "@/components/portal/PaymentParts";
import { getPropertyPricing } from "@/lib/data";
import { notFound } from "next/navigation";
import {
  CancelInvite,
  ResendInvite,
  ClientNotes,
  CurrencyField,
  ClientInviteForm,
  RetentionSelect,
} from "@/components/admin/ClientAccountTools";
import {
  ClientSuggestions,
  OfferPreview,
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
  searchParams: Promise<{ created?: string; emailed?: string; tab?: string }>;
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
  const [c, billing, invoices, openInvites, history, setup, pricing, payments, valueMonth] =
    await Promise.all([
      rpc<ClientDetail | null>("portal_admin_client", { p_id: id, p_view_as: false }),
      rpc<ClientBilling>("portal_admin_client_billing", { p_account: id }),
      rpc<InvoiceRowData[]>("portal_admin_invoices", { p_account: id }),
      rpc<{ id: string; last_sent_at: string | null }[]>("portal_admin_open_invites", {
        p_account: id,
      }),
      rpc<BillingHistory>("portal_admin_billing_history", { p_account: id }),
      rpc<ClientSetupData | null>("portal_admin_client_setup", { p_account: id }),
      getPropertyPricing(),
      // Payment terms and the value package (owner, 24 Oct 2026).
      rpc<ClientPayments>("portal_admin_client_payments", { p_account: id }),
      rpc<ValueMonth | null>("portal_admin_value_month", { p_account: id }),
    ]);
  // Package rollover (phase 1 part 4): this client's rule and carried credit.
  const rollover = valueMonth
    ? await rpc<RolloverView>("portal_admin_rollover", { p_package: null, p_account: id })
    : null;
  const sentAt = new Map(openInvites.map((i) => [i.id, i.last_sent_at]));
  if (!c || !setup) notFound();
  const a = c.account;
  const { created, emailed, tab } = await searchParams;
  const pkg = billing.plan.package;
  const planChip =
    history.mode === "budget"
      ? "Budget package"
      : pkg
        ? `${pkg.name} · ${money(pkg.currency, pkg.price)}/mo`
        : "Pay as you go";

  const overview = (
    <SaveGroup label="overview">
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
            <dd className="ad-pre">{a.billing_address ?? "—"}</dd>
            <dt>Members see</dt>
            <dd>Set per member by the client (Team → Access)</dd>
          </dl>
          <RetentionSelect accountId={a.id} months={a.retention_months ?? 12} />
        </section>
        <ClientNotes id={a.id} notes={c.notes ?? ""} />
      </div>
      <ServicesBlock account={a.id} s={setup.services} />
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
    </SaveGroup>
  );

  const billingTab = (
    <SaveGroup label="billing & payment">
      <HowTheyPay
        account={a.id}
        data={payments}
        bankTransfer={(a as { bank_transfer?: boolean }).bank_transfer !== false}
      >
        <CurrencyField id={a.id} currency={a.currency} />
      </HowTheyPay>
      <PlanBlock
        account={a.id}
        data={setup}
        showBudgetSet={history.show_budget_set}
        value={{
          allowance: payments.package?.allowance ?? null,
          half_day_cap: payments.package?.half_day_cap ?? null,
          templates: payments.templates,
        }}
      />
      {history.mode === "budget" && (
        <BudgetPanel account={a.id} currency={billing.currency} h={history} />
      )}
      {rollover && <RolloverSettings account={id} data={rollover} />}
      {/* The same card the client sees on Billing (portal styles), with the money. */}
      {valueMonth && (
        <div className="pt ad-portal-card" data-tone="light">
          <ValuePackageCard v={valueMonth} admin />
        </div>
      )}
      <PriceList account={a.id} data={setup} pricing={pricing} history={history.rates} />

      <section className="ad-card ad-form" aria-label="This month" data-testid="client-billing">
        <div className="ad-row-between">
          <h2 className="ad-h2">This month · {billing.currency}</h2>
          <Link className="ad-btn ghost small" href="/admin/billing" prefetch={false}>
            Invoices ({invoices.length})
          </Link>
        </div>
        {history.mode === "budget" ? null : pkg ? (
          <div className="ad-stack-8">
            <b>
              {pkg.name} · {money(pkg.currency, pkg.price)}/month
              {pkg.prorated
                ? ` · first month pro-rated (${pkg.days}/${pkg.month_days} days)`
                : pkg.term_months === 6
                  ? ` · Month ${pkg.month_no} of 6${pkg.ends_on ? `, ends ${dateLabel(pkg.ends_on)}` : ""}`
                  : ""}{" "}
              · renews {dateLabel(pkg.renews_on)}
            </b>
            {pkg.usage.map((u) => (
              <div key={u.key} className="ad-stack-4">
                <span className="ad-small">
                  {u.label}: {Number(u.used)} of {Number(u.qty)}
                  {Number(u.over) > 0
                    ? ` · ${Number(u.over)} over (${money(pkg.currency, Number(u.overage))})`
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
              This month, estimated: {money(pkg.currency, Number(pkg.estimate))}
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
        <details>
          <summary className="ad-small">Monthly statements</summary>
          <Statements account={a.id} billing={billing} />
        </details>
      </section>

      <section className="ad-card ad-form" aria-label="What the client sees">
        <h2 className="ad-h2">What the client sees</h2>
        <BillingSwitches account={a.id} h={history} />
        {/* Not needed at launch (AUDIT item 14): package suggestions. */}
        <details data-testid="billing-advanced">
          <summary className="ad-small">Advanced: package suggestions</summary>
          <OfferPreview billing={billing} />
          <ClientSuggestions account={a.id} billing={billing} />
        </details>
      </section>
    </SaveGroup>
  );

  const projectsTab = (
    <>
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
            href={`/admin/projects?q=${encodeURIComponent(a.name)}&type=all`}
            prefetch={false}
          >
            Their projects
          </Link>
          <Link
            className="ad-btn ghost small"
            href={`/admin/listings?account=${a.id}`}
            prefetch={false}
          >
            Share pages
          </Link>
        </div>
        <AttachBooking account={a.id} />
      </section>

      <section className="ad-card" aria-label="Bookings">
        <h2 className="ad-h2">Website bookings</h2>
        {c.bookings.length ? (
          <div className="ad-list">
            {c.bookings.map((b) => (
              <Link
                key={b.ref}
                href={`/admin/projects/ref/${b.ref}`}
                className="ad-row ad-lead"
                prefetch={false}
              >
                <span className="ad-tag">{b.ref}</span>
                <span className="ad-row-main">
                  <span>
                    <span className="ad-row-title">
                      {b.properties
                        .map((p) => `${propertyTitle({ ...p, line: 0 })}, ${day(p.date)}`)
                        .join(" + ")}
                    </span>
                    <span className="ad-row-meta ad-block">
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
    </>
  );

  const peopleTab = (
    <>
      <section className="ad-card" aria-label="Members">
        <h2 className="ad-h2">Members</h2>
        {c.members.length ? (
          <div className="ad-list" data-testid="members">
            {c.members.map((m) => (
              <div key={m.user_id} className="ad-row ad-lead ad-top">
                <span className="ad-tag">{ROLE[m.role]}</span>
                <span className="ad-row-main">
                  <span>
                    <span className="ad-row-title">{m.name ?? m.email ?? m.phone}</span>
                    <span className="ad-row-meta ad-block">
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
            <h3 className="ad-h3">Invited, not joined yet</h3>
            <div className="ad-list" data-testid="invites">
              {c.invites.map((i) => (
                <div key={i.id} className="ad-row ad-lead">
                  <span className="ad-tag">{ROLE[i.role]}</span>
                  <span className="ad-row-main">
                    <span>
                      <span className="ad-row-title">{i.name ?? i.email ?? i.phone}</span>
                      <span className="ad-row-meta ad-block">
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
    </>
  );

  const historyTab = (
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
                <span className="ad-row-meta ad-block">
                  {g.actor} · {dubai(g.at, true)}
                </span>
              </span>
            </span>
          </div>
        ))}
      </div>
    </section>
  );

  return (
    <div className="ad-page">
      <div className="ad-head">
        <div>
          <Link className="ad-eb" href="/admin/accounts" prefetch={false}>
            ← Clients
          </Link>
          <h1 className="ad-h1">{a.name}</h1>
          <span className="ad-small ad-muted">
            {a.type === "company"
              ? industryLabel(a.industry, a.industry_other) || "Company"
              : "Individual"}{" "}
            · {a.currency} · since {dubai(a.created_at)}
          </span>
          <span className="ad-btns ad-chips">
            <Pill tone="neutral">{planChip}</Pill>
            <Pill tone="neutral">{TERMS_LABEL[payments.payment_terms]}</Pill>
          </span>
        </div>
        <div className="ad-btns">
          <Link className="ad-btn" href={`/admin/projects/new?account=${a.id}`} prefetch={false}>
            New project
          </Link>
          <Link className="ad-btn ghost" href={`/admin/accounts/${a.id}/view`} prefetch={false}>
            View as client
          </Link>
          <Link
            className="ad-btn quiet"
            href={`/admin/accounts/${a.id}/characters`}
            prefetch={false}
          >
            AI characters
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
                ? "The invite email didn’t go out: use Resend invite under People."
                : "Send the Owner invite under People so they know where to sign in."}
        </p>
      )}
      <ClientTabs
        initial={tab ?? (created ? "people" : "overview")}
        tabs={[
          { key: "overview", label: "Overview", node: overview },
          { key: "billing", label: "Billing & payment", node: billingTab },
          { key: "projects", label: "Projects", node: projectsTab },
          { key: "people", label: "People", node: peopleTab },
          { key: "history", label: "History", node: historyTab },
        ]}
      />
    </div>
  );
}
