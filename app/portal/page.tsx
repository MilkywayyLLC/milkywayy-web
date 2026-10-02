import Link from "next/link";
import { contactOf, requireAccount } from "@/lib/portal/auth";
import { signOut } from "@/lib/portal/actions";
import { industryLabel, serviceLabel } from "@/lib/portal/options";

// The layout's title template only applies to child segments, so this one is spelled out.
export const metadata = { title: { absolute: "Home · Milkywayy portal" } };

type Booking = {
  ref: string;
  booked_at: string;
  properties: {
    line: number;
    type: string;
    size: string;
    services: string[];
    lighting?: string;
    area: string;
    building: string;
    unit?: string;
    date: string;
    slot: string;
    subtotal?: number;
  }[];
};

const SHOOT_SERVICES: Record<string, string> = {
  photo: "Photography",
  short: "Short-form video",
  long: "Long-form video",
  tour: "360 tour",
};
const day = (d: string) =>
  new Date(`${d}T12:00:00`).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });

/**
 * Portal home, Phase 9 foundation: the signed-in account and the bookings attached to it. The
 * full shell (tabs, switcher, plan badge, Team/Contacts/Settings) is Phase 9 step 4.
 */
export default async function PortalHome({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { db, user, current, memberships } = await requireAccount("/portal");
  const q = await searchParams;
  const a = current.account;
  const { data, error } = await db.rpc("account_bookings", { p_account: a.id });
  if (error) console.error("[portal] account_bookings:", error.message);
  const bookings = (data ?? []) as Booking[];
  const claimed = Number(q.claimed ?? 0);

  return (
    <>
      <header className="pt-top" style={{ top: 0 }}>
        <Link href="/" className="pt-logo">
          <i className="rec-dot" aria-hidden="true" /> MILKYWAYY
        </Link>
        <div className="pt-top-right">
          <span
            className="pt-switch"
            style={{ cursor: "default" }}
            title={memberships.length > 1 ? `${memberships.length} accounts` : undefined}
          >
            <span className="pt-switch-name">{a.name}</span>
          </span>
          <form action={signOut}>
            <button type="submit" className="btn btn-g btn-s pt-btn-sm">
              Sign out
            </button>
          </form>
        </div>
      </header>
      <main className="pt-content" id="main" style={{ paddingBottom: 48 }}>
        <div className="pt-head">
          <div>
            <span className="pt-eb">{contactOf(user)}</span>
            <h1 className="pt-h1">Home</h1>
          </div>
          {a.services_interest.includes("shoots") || a.services_interest.length === 0 ? (
            <a href="/property-shoots" className="btn btn-p btn-s">
              Book a shoot
            </a>
          ) : null}
        </div>

        {claimed > 0 && (
          <p className="pt-note" role="status">
            We found {claimed} earlier booking{claimed === 1 ? "" : "s"} made with your email and
            added {claimed === 1 ? "it" : "them"} below.
          </p>
        )}
        {q.welcome && !claimed && (
          <p className="pt-note" role="status">
            You’re all set. Your bookings and projects will show up here.
          </p>
        )}
        {q.password && (
          <p className="pt-note" role="status">
            Password updated.
          </p>
        )}

        <section className="pt-card" aria-labelledby="acct">
          <div className="pt-row">
            <h2 id="acct" className="pt-h2">
              {a.name}
            </h2>
            <span className="pt-badge">{current.role}</span>
          </div>
          <span className="pt-meta">
            {a.type === "company"
              ? industryLabel(a.industry, a.industry_other) || "Company"
              : "Individual"}
            {a.services_interest.length > 0 &&
              ` · ${a.services_interest.map(serviceLabel).join(", ")}`}
          </span>
        </section>

        <section style={{ display: "grid", gap: 10 }} aria-labelledby="bk">
          <h2 id="bk" className="pt-h2">
            Your bookings
          </h2>
          {bookings.length === 0 ? (
            <div className="pt-card">
              <span>No bookings yet.</span>
              <span className="pt-meta">
                Bookings you make on the website with {contactOf(user)} appear here automatically.
              </span>
            </div>
          ) : (
            <div className="pt-list" data-testid="bookings">
              {bookings.map((b) => (
                <article key={b.ref} style={{ display: "grid", gap: 8 }}>
                  <div className="pt-row">
                    <b className="pt-mono" style={{ fontSize: 14 }}>
                      {b.ref}
                    </b>
                    <span className="pt-badge">Requested</span>
                  </div>
                  {b.properties.map((p) => (
                    <div key={p.line} style={{ display: "grid", gap: 2 }}>
                      <b className="pt-title">
                        {p.size} {p.type}, {p.building}
                        {p.unit ? ` · ${p.unit}` : ""}
                      </b>
                      <span className="pt-meta">
                        {p.area} · {day(p.date)} · {p.slot}
                      </span>
                      <span className="pt-meta">
                        {p.services.map((s) => SHOOT_SERVICES[s] ?? s).join(" · ")}
                        {p.subtotal != null &&
                          ` · AED ${p.subtotal.toLocaleString("en-US")} (estimate at booking)`}
                      </span>
                    </div>
                  ))}
                  <span className="pt-meta pt-mono">
                    Booked{" "}
                    {new Date(b.booked_at).toLocaleDateString("en-GB", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </span>
                </article>
              ))}
            </div>
          )}
        </section>

        <p className="pt-meta" style={{ margin: 0 }}>
          This is the start of your portal: shoots with live status, downloads, editing and billing
          come next.
        </p>
      </main>
    </>
  );
}
