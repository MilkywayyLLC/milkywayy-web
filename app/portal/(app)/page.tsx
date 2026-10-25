import { dateLabel, money, shownStatus, type Invoice } from "@/lib/portal/billing";
import { Icon } from "@/components/portal/Icon";
import { projectCovers } from "@/lib/portal/covers";
import Link from "next/link";
import { getSiteSettings } from "@/lib/data";
import { contactOf, requireAccount } from "@/lib/portal/auth";
import { LiveRefresh } from "@/components/portal/LiveRefresh";
import { YourWork } from "@/components/portal/YourWork";
import { requestConfig } from "@/lib/portal/requests";
import { statusLabel, type Project } from "@/lib/portal/projects";
import { isManager, seesMoney } from "@/lib/portal/shell";

export const metadata = { title: { absolute: "Home · Milkywayy portal" } };

/** Home (§5.1; V2 reskin, 25 Oct 2026): a greeting, what needs the client (the first as a hero
 *  with its delivery photo), Book something new, their work, recent activity and three stats. */
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
    cfg,
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
    // Invoices waiting for payment: those who see billing only (RLS returns none to others).
    seesMoney(current)
      ? db
          .from("invoices")
          .select("id, number, due_on, status, amount, currency")
          .eq("account_id", a.id)
          .order("due_on")
      : Promise.resolve({ data: [] }),
    requestConfig(db, current),
  ]);

  const invoices = (invoiceRows ?? []) as Pick<
    Invoice,
    "id" | "number" | "due_on" | "status" | "amount" | "currency"
  >[];
  const unpaid = invoices.filter((i) => i.status !== "paid");
  const paid = invoices.filter((i) => i.status === "paid");
  const projects = (projectRows ?? []) as Project[];
  const waiting = projects.filter(
    (p) =>
      p.status === "delivered" &&
      !(p.revision_state === "requested" || p.revision_state === "in_progress"),
  );
  const scripts = projects.filter((p) => p.status === "script_ready");
  const onHold = projects.filter((p) => p.status === "on_hold");
  const area = (t: string) => (t === "edit" ? "Editing" : t === "avatar" ? "Avatars" : "Shoots");
  const events = (eventRows ?? []) as unknown as {
    id: number;
    kind: string;
    to_status: string | null;
    note: string | null;
    at: string;
    project: { ref: string; title: string; type: string };
  }[];
  const claimed = Number(q.claimed ?? 0);
  const now = new Date().toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "Asia/Dubai",
  });
  const openInvites = invites.count ?? 0;
  const first = (profile?.full_name ?? "").trim().split(/\s+/)[0] ?? "";
  const activeCount = projects.filter(
    (p) => p.status !== "completed" && p.status !== "cancelled",
  ).length;
  const deliveredCount = projects.filter(
    (p) => p.status === "delivered" || p.status === "completed",
  ).length;
  const spent = paid.reduce((n, i) => n + Number(i.amount ?? 0), 0);
  const href = (p: Project) => `/portal/p/${encodeURIComponent(p.ref)}`;

  // Needs your attention: the same items as before; the first is the hero.
  type Attn = {
    key: string;
    href: string;
    eb: string;
    title: React.ReactNode;
    plain: string;
    text: string;
    cta: string;
    /** A delivered project's photo ("" = none yet); undefined = no picture column. */
    cover?: string;
  };
  const covers = await projectCovers(
    db,
    waiting.slice(0, 1).map((p) => p.id),
  );
  const attn: Attn[] = [
    ...waiting.map((p) => {
      const plain =
        p.revision_state === "delivered" ? "Revision delivered" : "Your files are ready";
      return {
        key: p.id,
        href: href(p),
        eb: `${area(p.type)} · ${p.ref}`,
        title:
          p.revision_state === "delivered" ? (
            <>
              Revision <em>delivered</em>
            </>
          ) : (
            <>
              Your files are <em>ready</em>
            </>
          ),
        plain,
        text: `${p.title}. Download, then approve or ask for a revision.`,
        cta: "Download & review",
        cover: covers.get(p.id) ?? "",
      };
    }),
    ...scripts.map((p) => ({
      key: p.id,
      href: href(p),
      eb: `Avatars · ${p.ref}`,
      title: (
        <>
          Approve the <em>script</em>
        </>
      ),
      plain: "Approve the script",
      text: `${p.title}. Production starts once you approve.`,
      cta: "Review script",
    })),
    ...onHold.map((p) => ({
      key: p.id,
      href: href(p),
      eb: `${area(p.type)} · ${p.ref}`,
      title: (
        <>
          On hold: <em>waiting on you</em>
        </>
      ),
      plain: "On hold: waiting on you",
      text: [p.title, p.status_note].filter(Boolean).join(". "),
      cta: "Open",
    })),
    // No amounts on Home (owner, 4 Oct 2026): money only on the invoice itself.
    ...unpaid.map((i) => {
      const plain = shownStatus(i) === "overdue" ? "Invoice overdue" : "Invoice due";
      return {
        key: i.id,
        href: "/portal/billing",
        eb: `Billing · ${i.number ?? ""}`,
        title: plain,
        plain,
        text: `Due ${dateLabel(i.due_on)}. Open Billing to see it and pay.`,
        cta: "Open Billing",
      };
    }),
    ...(openInvites > 0
      ? [
          {
            key: "invites",
            href: "/portal/team",
            eb: "Team",
            title: `${openInvites} invite${openInvites === 1 ? "" : "s"} pending`,
            plain: `${openInvites} invite${openInvites === 1 ? "" : "s"} not accepted yet`,
            text: "They join once they sign in with the email you invited.",
            cta: "Open Team",
          },
        ]
      : []),
  ];
  const tiles = [
    ...(cfg.shoots
      ? [
          {
            href: "/portal/book?kind=property",
            icon: "building",
            title: "Property shoot",
            line: "Photos, 360° tour, video",
          },
          {
            href: "/portal/book?kind=content",
            icon: "video",
            title: "Content shoot",
            line: "Reels and YouTube",
          },
        ]
      : []),
    ...(cfg.editing
      ? [
          {
            href: "/portal/book?kind=edit",
            icon: "scissors",
            title: "Edit only",
            line: "Send files, we edit",
          },
        ]
      : []),
    ...(cfg.avatars && (!cfg.shoots || !cfg.editing)
      ? [
          {
            href: "/portal/avatars/new",
            icon: "ai",
            title: "AI avatar video",
            line: "Brief a presenter video",
          },
        ]
      : []),
  ].slice(0, 3);

  return (
    <>
      <LiveRefresh />
      <div className="pt-hi">
        <span className="pt-eb">{now}</span>
        <h1 className="pt-h1">{first ? `Hi, ${first}` : "Home"}</h1>
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

      {attn.length > 0 && (
        <section className="pt-sec" aria-labelledby="attn">
          <h2 id="attn" className="pt-eb">
            Needs your attention
          </h2>
          <div data-testid="attention" className="pt-sec">
            <Link href={attn[0].href} className="pt-hero">
              {attn[0].cover !== undefined && (
                <span className="pt-hero-img">
                  {attn[0].cover ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={attn[0].cover} alt="" />
                  ) : (
                    <span className="pt-hero-ph">
                      <Icon name="photo" size={40} />
                    </span>
                  )}
                </span>
              )}
              <span className="pt-hero-body">
                <span className="pt-eb">{attn[0].eb}</span>
                <b className="pt-hero-h">{attn[0].title}</b>
                <span className="pt-meta">{attn[0].text}</span>
                <span className="pt-hero-btns">
                  <span className="btn btn-p btn-s">{attn[0].cta}</span>
                </span>
              </span>
            </Link>
            {attn.length > 1 && (
              <div className="pt-card pt-hero-more">
                {attn.slice(1).map((x) => (
                  <Link key={x.key} href={x.href} className="pt-attn-row">
                    <span>
                      <span className="pt-eb">{x.eb}</span>
                      <b>{x.plain}</b>
                      <span className="pt-meta">{x.text}</span>
                    </span>
                    <Icon name="chevron" size={16} />
                  </Link>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      {tiles.length > 0 && (
        <section className="pt-sec" aria-labelledby="new">
          <h2 id="new" className="pt-eb">
            Book something new
          </h2>
          <div className="pt-tiles3">
            {tiles.map((t) => (
              <Link key={t.href} href={t.href} className="pt-tile3">
                <Icon name={t.icon} size={22} />
                <b>{t.title}</b>
                <small>{t.line}</small>
              </Link>
            ))}
          </div>
        </section>
      )}

      <div className="pt-home-grid">
        <YourWork projects={projects} cfg={cfg} />

        <section className="pt-sec" aria-labelledby="act">
          <h2 id="act" className="pt-eb">
            Recent activity
          </h2>
          <div className="pt-card">
            {events.length ? (
              <ul className="pt-activity pt-timeline" data-testid="activity">
                {events.map((e) => (
                  <li key={e.id}>
                    <Link href={`/portal/p/${encodeURIComponent(e.project.ref)}`}>
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
                      <time dateTime={e.at}>
                        {new Date(e.at).toLocaleDateString("en-GB", {
                          day: "numeric",
                          month: "short",
                        })}
                      </time>
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
          </div>
        </section>
      </div>

      <section className="pt-stats" aria-label="At a glance" data-testid="stats">
        <div className="pt-stat3">
          <span className="pt-eb">Active</span>
          <b>{activeCount}</b>
        </div>
        <div className="pt-stat3">
          <span className="pt-eb">Delivered</span>
          <b>{deliveredCount}</b>
        </div>
        {seesMoney(current) ? (
          <div className="pt-stat3">
            <span className="pt-eb">Spent</span>
            <b>{money(paid[0]?.currency ?? "AED", spent)}</b>
          </div>
        ) : (
          <div className="pt-stat3">
            <span className="pt-eb">Completed</span>
            <b>{projects.filter((p) => p.status === "completed").length}</b>
          </div>
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
