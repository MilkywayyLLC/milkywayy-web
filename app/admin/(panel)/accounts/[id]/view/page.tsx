import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, Stepper } from "@/components/portal/ui";
import { portalAdminPage, type ClientDetail } from "@/lib/portal/admin";
import { day, propertyTitle, SHOOT_SERVICES } from "@/lib/portal/bookings";
import { industryLabel, serviceLabel } from "@/lib/portal/options";
import { SHOOT_STEPS } from "@/lib/portal/steps";
import "@/app/styles/portal.css";

export const metadata = { title: "View as client" };

/**
 * Read-only "view as client" (§7.1): what this account sees in its portal, built from the
 * same data, with nothing clickable that changes anything. Every opening is logged (view_as).
 * Admin notes are left out. It doesn't sign you in as them.
 */
export default async function ViewAs({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const rpc = await portalAdminPage();
  const c = await rpc<ClientDetail | null>("portal_admin_client", { p_id: id, p_view_as: true });
  if (!c) notFound();
  const a = c.account;
  const lines = c.bookings.flatMap((b) => b.properties.map((p, i) => ({ ref: b.ref, p, i })));

  return (
    <div className="ad-page">
      <p className="ad-note warn" role="status">
        Viewing as <b>{a.name}</b>: read-only, and logged in the client’s admin history.{" "}
        <Link href={`/admin/accounts/${a.id}`} prefetch={false}>
          Back to the client
        </Link>
      </p>
      <div
        className="pt"
        data-tone="light"
        style={{ minHeight: 0, border: "1px solid var(--line)" }}
        data-testid="view-as"
      >
        <div className="pt-content" style={{ paddingBottom: 32 }}>
          <div className="pt-head">
            <div>
              <span className="pt-eb">
                {a.name} · Pay as you go · {a.currency}
              </span>
              <h1 className="pt-h1">Home</h1>
            </div>
          </div>
          <section className="pt-card">
            <h2 className="pt-h2">Shoots</h2>
            {lines.length ? (
              <div className="pt-grid2">
                {lines.map(({ ref, p, i }) => (
                  <article key={`${ref}-${i}`} className="pt-card">
                    <div className="pt-row">
                      <span className="pt-eb">{ref}</span>
                      <Badge>Requested</Badge>
                    </div>
                    <b className="pt-title">
                      {propertyTitle({ ...p, line: i })}
                      {p.unit ? ` · ${p.unit}` : ""}
                    </b>
                    <span className="pt-meta">
                      {p.area} · {day(p.date)} · {p.slot} ·{" "}
                      {p.services.map((s) => SHOOT_SERVICES[s] ?? s).join(" · ")}
                      {p.subtotal != null
                        ? ` · ${a.currency} ${p.subtotal.toLocaleString("en-US")}`
                        : ""}
                    </span>
                    <Stepper steps={SHOOT_STEPS} now="Requested" />
                  </article>
                ))}
              </div>
            ) : (
              <span className="pt-meta">No shoots yet.</span>
            )}
          </section>
          <div className="pt-grid2">
            <section className="pt-card">
              <h2 className="pt-h2">Team</h2>
              <div className="pt-list">
                {c.members.map((m) => (
                  <div key={m.user_id} className="pt-row">
                    <span>{m.name ?? m.email ?? m.phone}</span>
                    <Badge tone={m.role === "owner" ? "solid" : undefined}>{m.role}</Badge>
                  </div>
                ))}
                {!c.members.length && <span className="pt-meta">Nobody has joined yet.</span>}
              </div>
              <span className="pt-meta">
                Members see{" "}
                {a.member_visibility === "all" ? "all company projects" : "only their own projects"}
                .
              </span>
            </section>
            <section className="pt-card">
              <h2 className="pt-h2">Contacts</h2>
              <div className="pt-pills">
                {c.contacts.map((x) => (
                  <span
                    key={x.name}
                    className="pt-pill"
                    aria-pressed={x.is_default ? "true" : "false"}
                  >
                    <span className="pt-pill-face">{x.name.slice(0, 2).toUpperCase()}</span>
                    <span>
                      {x.name}
                      <small>{[x.role, x.brn].filter(Boolean).join(" · ")}</small>
                    </span>
                  </span>
                ))}
                {!c.contacts.length && <span className="pt-meta">No contacts saved.</span>}
              </div>
            </section>
          </div>
          <section className="pt-card">
            <h2 className="pt-h2">Settings</h2>
            <span>
              {a.name}
              {a.type === "company" && a.industry
                ? ` · ${industryLabel(a.industry, a.industry_other)}`
                : ""}
            </span>
            <span className="pt-meta">
              Services: {a.services_interest.map(serviceLabel).join(", ") || "none chosen"} · TRN{" "}
              {a.trn ?? "—"}
            </span>
          </section>
        </div>
      </div>
    </div>
  );
}
