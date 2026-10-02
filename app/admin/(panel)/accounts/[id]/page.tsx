import Link from "next/link";
import { notFound } from "next/navigation";
import {
  CancelInvite,
  ClientEditor,
  ClientInviteForm,
} from "@/components/admin/ClientAccountTools";
import { dubai } from "@/lib/admin/format";
import { portalAdminPage, type ClientDetail } from "@/lib/portal/admin";
import { day, propertyTitle, SHOOT_SERVICES } from "@/lib/portal/bookings";
import { industryLabel, serviceLabel } from "@/lib/portal/options";

export const metadata = { title: "Client" };

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ created?: string }> };

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
  const c = await rpc<ClientDetail | null>("portal_admin_client", { p_id: id, p_view_as: false });
  if (!c) notFound();
  const a = c.account;
  const { created } = await searchParams;

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
        <p className="ad-note">
          Client created. Send the Owner invite below so they know where to sign in.
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
        </section>
        <ClientEditor id={a.id} currency={a.currency} notes={c.notes ?? ""} />
      </div>

      <section className="ad-card" aria-label="Members">
        <h2 className="ad-h2">Members</h2>
        {c.members.length ? (
          <div className="ad-list" data-testid="members">
            {c.members.map((m) => (
              <div key={m.user_id} className="ad-row ad-lead">
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
                      </span>
                    </span>
                  </span>
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
