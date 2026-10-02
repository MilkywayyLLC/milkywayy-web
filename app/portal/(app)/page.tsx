import Link from "next/link";
import { Icon } from "@/components/portal/Icon";
import { getSiteSettings } from "@/lib/data";
import { contactOf, requireAccount } from "@/lib/portal/auth";
import { accountBookings, day, propertyTitle } from "@/lib/portal/bookings";
import { isManager } from "@/lib/portal/shell";

export const metadata = { title: { absolute: "Home · Milkywayy portal" } };

/** Home (§5.1): what needs the client, what's in progress, their plan, and recent activity. */
export default async function PortalHome({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { db, user, current } = await requireAccount("/portal");
  const q = await searchParams;
  const a = current.account;
  const [bookings, { data: profile }, invites, chat] = await Promise.all([
    accountBookings(db, a.id),
    db.from("profiles").select("full_name").eq("user_id", user.id).maybeSingle(),
    isManager(current)
      ? db
          .from("account_invites")
          .select("id", { count: "exact", head: true })
          .eq("account_id", a.id)
          .is("accepted_at", null)
      : Promise.resolve({ count: 0 }),
    getSiteSettings()
      .then((s) => s.whatsapp.number)
      .catch(() => ""),
  ]);
  const first = (profile?.full_name ?? "").split(" ")[0];
  const claimed = Number(q.claimed ?? 0);
  const s = a.services_interest;
  const now = new Date().toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "Asia/Dubai",
  });
  const openInvites = invites.count ?? 0;

  return (
    <>
      <div className="pt-head">
        <div>
          <span className="pt-eb">
            {now}
            {first ? ` · Hello, ${first}` : ""}
          </span>
          <h1 className="pt-h1">Home</h1>
        </div>
        <div className="pt-btns">
          {(s.includes("shoots") || s.includes("production") || bookings.length > 0) && (
            <a href="/property-shoots" className="btn btn-p btn-s">
              <Icon name="plus" size={16} /> Book a shoot
            </a>
          )}
        </div>
      </div>

      {claimed > 0 && (
        <p className="pt-note" role="status">
          We found {claimed} earlier booking{claimed === 1 ? "" : "s"} made with {contactOf(user)}{" "}
          and added {claimed === 1 ? "it" : "them"} to {a.name}.
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

      <section className="pt-card" aria-labelledby="attn">
        <h2 id="attn" className="pt-h2">
          Needs your attention
        </h2>
        {openInvites > 0 ? (
          <Link href="/portal/team" className="pt-attn" style={{ padding: "6px 0" }}>
            <div style={{ display: "grid", gap: 4 }}>
              <span className="pt-eb">Team</span>
              <b>
                {openInvites} invite{openInvites === 1 ? "" : "s"} not accepted yet
              </b>
              <span className="pt-meta">
                They join once they sign in with the number or email you invited.
              </span>
            </div>
          </Link>
        ) : (
          <p className="pt-meta" style={{ margin: 0 }}>
            Nothing needs you right now. Approvals, deliveries and invoices show up here.
          </p>
        )}
      </section>

      <div className="pt-grid2">
        <section className="pt-card" aria-labelledby="prog">
          <h2 id="prog" className="pt-h2">
            In progress
          </h2>
          <Link href="/portal/shoots" className="pt-stat" style={{ textDecoration: "none" }}>
            <b>{bookings.length}</b>
            <span className="pt-meta">Shoot{bookings.length === 1 ? "" : "s"} requested</span>
          </Link>
        </section>
        <section className="pt-card" aria-labelledby="plan">
          <h2 id="plan" className="pt-h2">
            Pay as you go
          </h2>
          <span className="pt-meta">
            You pay per project in {a.currency}. Your monthly running total and invoices will show
            in Billing.
          </span>
        </section>
      </div>

      <section className="pt-card" aria-labelledby="act">
        <h2 id="act" className="pt-h2">
          Latest activity
        </h2>
        {bookings.length ? (
          <ul className="pt-timeline">
            {bookings.slice(0, 6).map((b) => (
              <li key={b.ref}>
                <Link href="/portal/shoots" style={{ textDecoration: "none", display: "grid" }}>
                  <span>
                    {b.ref} · Requested:{" "}
                    {b.properties[0] ? propertyTitle(b.properties[0]) : "shoot"}
                    {b.properties[0] ? `, ${day(b.properties[0].date)}` : ""}
                  </span>
                  <span className="pt-meta pt-mono">
                    {new Date(b.booked_at).toLocaleDateString("en-GB", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="pt-meta" style={{ margin: 0 }}>
            Nothing yet. Bookings you make on the website with {contactOf(user)} appear here
            automatically.
          </p>
        )}
      </section>

      {chat && (
        <a
          href={`https://wa.me/${chat}?text=${encodeURIComponent(`Hi Milkywayy, it's ${profile?.full_name ?? contactOf(user)} (${a.name}).`)}`}
          className="btn btn-g"
          target="_blank"
          rel="noopener"
        >
          WhatsApp us
        </a>
      )}
    </>
  );
}
