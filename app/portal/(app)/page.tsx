import { dateLabel, shownStatus, type Invoice } from "@/lib/portal/billing";
import Link from "next/link";
import { Icon } from "@/components/portal/Icon";
import { getSiteSettings } from "@/lib/data";
import { contactOf, requireAccount } from "@/lib/portal/auth";
import { LiveRefresh } from "@/components/portal/LiveRefresh";
import { statusLabel, type Project } from "@/lib/portal/projects";
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
  const [
    { data: projectRows },
    { data: profile },
    invites,
    chat,
    { data: eventRows },
    { data: invoiceRows },
  ] = await Promise.all([
    db
      .from("projects")
      .select("*")
      .eq("account_id", a.id)
      .order("updated_at", { ascending: false }),
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
    db
      .from("project_events")
      .select("id, kind, to_status, note, at, project:projects!inner(ref, title, type, account_id)")
      .eq("project.account_id", a.id)
      .order("at", { ascending: false })
      .limit(8),
    // Invoices waiting for payment: Owner and Admins only (RLS returns none to Members).
    isManager(current)
      ? db
          .from("invoices")
          .select("id, number, due_on, status")
          .eq("account_id", a.id)
          .neq("status", "paid")
          .order("due_on")
      : Promise.resolve({ data: [] }),
  ]);
  const unpaid = (invoiceRows ?? []) as Pick<
    Invoice,
    "id" | "number" | "due_on" | "status"
  >[];
  const projects = (projectRows ?? []) as Project[];
  const waiting = projects.filter(
    (p) =>
      p.status === "delivered" &&
      !(p.revision_state === "requested" || p.revision_state === "in_progress"),
  );
  const scripts = projects.filter((p) => p.status === "script_ready");
  const onHold = projects.filter((p) => p.status === "on_hold");
  const inProgress = projects.filter((p) => p.status !== "completed");
  const area = (t: string) => (t === "edit" ? "Editing" : t === "avatar" ? "Avatars" : "Shoots");
  const events = (eventRows ?? []) as unknown as {
    id: number;
    kind: string;
    to_status: string | null;
    note: string | null;
    at: string;
    project: { ref: string; title: string; type: string };
  }[];
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
      <LiveRefresh />
      <div className="pt-head">
        <div>
          <span className="pt-eb">
            {now}
            {first ? ` · Hello, ${first}` : ""}
          </span>
          <h1 className="pt-h1">Home</h1>
        </div>
        <div className="pt-btns">
          {(s.includes("shoots") ||
            s.includes("production") ||
            projects.some((p) => p.type === "shoot")) && (
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
        {waiting.length + scripts.length + onHold.length + unpaid.length === 0 &&
          openInvites === 0 && (
            <p className="pt-meta" style={{ margin: 0 }}>
              Nothing needs you right now. Approvals, deliveries and invoices show up here.
            </p>
          )}
        <div className="pt-list" style={{ border: 0 }} data-testid="attention">
          {scripts.map((p) => (
            <Link
              key={p.id}
              href={`/portal/p/${encodeURIComponent(p.ref)}`}
              className="pt-attn"
              style={{ padding: "10px 0" }}
            >
              <div style={{ display: "grid", gap: 4 }}>
                <span className="pt-eb">Avatars · {p.ref}</span>
                <b>Approve the script</b>
                <span className="pt-meta">{p.title}. Production starts once you approve.</span>
              </div>
            </Link>
          ))}
          {onHold.map((p) => (
            <Link
              key={p.id}
              href={`/portal/p/${encodeURIComponent(p.ref)}`}
              className="pt-attn"
              style={{ padding: "10px 0" }}
            >
              <div style={{ display: "grid", gap: 4 }}>
                <span className="pt-eb">
                  {area(p.type)} · {p.ref}
                </span>
                <b>On hold: waiting on you</b>
                <span className="pt-meta">
                  {p.title}. {p.status_note}
                </span>
              </div>
            </Link>
          ))}
          {waiting.map((p) => (
            <Link
              key={p.id}
              href={`/portal/p/${encodeURIComponent(p.ref)}`}
              className="pt-attn"
              style={{ padding: "10px 0" }}
            >
              <div style={{ display: "grid", gap: 4 }}>
                <span className="pt-eb">
                  {area(p.type)} · {p.ref}
                </span>
                <b>
                  {p.revision_state === "delivered" ? "Revision delivered" : "Your files are ready"}
                </b>
                <span className="pt-meta">
                  {p.title}. Download, then approve or ask for a revision.
                </span>
              </div>
            </Link>
          ))}
          {unpaid.map((i) => (
            <Link
              key={i.id}
              href="/portal/billing"
              className="pt-attn"
              style={{ padding: "10px 0" }}
            >
              <div style={{ display: "grid", gap: 4 }}>
                <span className="pt-eb">Billing · {i.number}</span>
                {/* No amounts on Home (owner, 4 Oct 2026): money only on the invoice itself. */}
                <b>{shownStatus(i) === "overdue" ? "Invoice overdue" : "Invoice due"}</b>
                <span className="pt-meta">
                  Due {dateLabel(i.due_on)}. Open Billing to see it and pay.
                </span>
              </div>
            </Link>
          ))}
          {openInvites > 0 && (
            <Link href="/portal/team" className="pt-attn" style={{ padding: "10px 0" }}>
              <div style={{ display: "grid", gap: 4 }}>
                <span className="pt-eb">Team</span>
                <b>
                  {openInvites} invite{openInvites === 1 ? "" : "s"} not accepted yet
                </b>
                <span className="pt-meta">
                  They join once they sign in with the email you invited.
                </span>
              </div>
            </Link>
          )}
        </div>
      </section>

      <div className="pt-grid2">
        <section className="pt-card" aria-labelledby="prog">
          <h2 id="prog" className="pt-h2">
            In progress
          </h2>
          <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
            {(
              [
                ["shoot", "/portal/shoots", "Shoots"],
                ["edit", "/portal/editing", "Editing"],
                ["avatar", "/portal/avatars", "Avatars"],
              ] as const
            ).map(([t, href, label]) => (
              <Link key={t} href={href} className="pt-stat" style={{ textDecoration: "none" }}>
                <b>{inProgress.filter((p) => p.type === t).length}</b>
                <span className="pt-meta">{label}</span>
              </Link>
            ))}
          </div>
        </section>
        <section className="pt-card" aria-labelledby="start">
          <h2 id="start" className="pt-h2">
            Start something
          </h2>
          <div className="pt-btns">
            <a href="/property-shoots#booking" className="btn btn-g btn-s">
              Book a shoot
            </a>
            <Link href="/portal/editing/new" className="btn btn-g btn-s">
              New editing batch
            </Link>
            <Link href="/portal/avatars/new" className="btn btn-g btn-s">
              New avatar video
            </Link>
          </div>
        </section>
      </div>

      <section className="pt-card" aria-labelledby="act">
        <h2 id="act" className="pt-h2">
          Latest activity
        </h2>
        {events.length ? (
          <ul className="pt-timeline" data-testid="activity">
            {events.map((e) => (
              <li key={e.id}>
                <Link
                  href={`/portal/p/${encodeURIComponent(e.project.ref)}`}
                  style={{ textDecoration: "none", display: "grid" }}
                >
                  <span>
                    {e.project.ref} ·{" "}
                    {e.kind === "created"
                      ? `${e.project.type === "shoot" ? "Requested" : "Submitted"}: ${e.project.title}`
                      : e.kind === "script_posted"
                        ? `Script ready: ${e.project.title}`
                        : e.kind === "script_approved"
                          ? `Script approved: ${e.project.title}`
                          : e.kind === "files_added"
                            ? `Files added: ${e.project.title}`
                            : e.kind === "status"
                              ? `${statusLabel(e.to_status ?? "")}: ${e.project.title}`
                              : e.kind === "delivery"
                                ? (e.note ?? "Delivered")
                                : e.kind === "revision_requested"
                                  ? "Revision requested"
                                  : e.kind === "revision_delivered"
                                    ? "Revision delivered"
                                    : e.kind === "approved" || e.kind === "auto_completed"
                                      ? "Completed"
                                      : (e.note ?? e.kind)}
                  </span>
                  <span className="pt-meta pt-mono">
                    {new Date(e.at).toLocaleDateString("en-GB", {
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
