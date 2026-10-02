import { Icon } from "@/components/portal/Icon";
import { Badge, Stepper } from "@/components/portal/ui";
import { requireAccount } from "@/lib/portal/auth";
import { accountBookings, day, propertyTitle, SHOOT_SERVICES } from "@/lib/portal/bookings";
import { isManager } from "@/lib/portal/shell";
import { SHOOT_STEPS } from "@/lib/portal/steps";

export const metadata = { title: "Shoots" };

/**
 * Shoots (§5.2). For now: website bookings attached to the account, each at "Requested".
 * Confirmations, deliveries and downloads come with the project engine (Phase 10).
 */
export default async function Shoots() {
  const { db, current } = await requireAccount("/portal/shoots");
  const bookings = await accountBookings(db, current.account.id);
  const lines = bookings.flatMap((b) =>
    b.properties.map((p) => ({ ref: b.ref, p, booked: b.booked_at })),
  );

  return (
    <>
      <div className="pt-head">
        <div>
          <span className="pt-eb">
            {lines.length} requested
            {!isManager(current) && current.account.member_visibility === "own" ? " · yours" : ""}
          </span>
          <h1 className="pt-h1">Shoots</h1>
        </div>
        <a href="/property-shoots" className="btn btn-p btn-s">
          <Icon name="plus" size={16} /> Book another shoot
        </a>
      </div>
      {lines.length === 0 ? (
        <div className="pt-card">
          <b>No shoots yet</b>
          <span className="pt-meta">
            Book on the website with the same number or email you sign in with, and it shows up
            here.
          </span>
        </div>
      ) : (
        <div className="pt-grid2" data-testid="shoots">
          {lines.map(({ ref, p }) => (
            <article key={`${ref}-${p.line}`} className="pt-card">
              <div className="pt-row">
                <span className="pt-eb">
                  {ref}
                  {bookings.find((b) => b.ref === ref)!.properties.length > 1
                    ? ` · property ${p.line}`
                    : ""}
                </span>
                <Badge>Requested</Badge>
              </div>
              <div style={{ display: "grid", gap: 2 }}>
                <b className="pt-title">
                  {propertyTitle(p)}
                  {p.unit ? ` · ${p.unit}` : ""}
                </b>
                <span className="pt-meta">
                  {p.area} · {day(p.date)} · {p.slot}
                </span>
                <span className="pt-meta">
                  {p.services.map((s) => SHOOT_SERVICES[s] ?? s).join(" · ")}
                  {p.subtotal != null &&
                    ` · ${current.account.currency} ${p.subtotal.toLocaleString("en-US")} (estimate at booking)`}
                </span>
              </div>
              <Stepper steps={SHOOT_STEPS} now="Requested" />
              <span className="pt-meta">
                We confirm the date and slot on WhatsApp, usually within a few hours.
              </span>
            </article>
          ))}
        </div>
      )}
    </>
  );
}
