import { dateLabel, money, shownStatus, type Invoice, type MyBilling } from "@/lib/portal/billing";
import Link from "next/link";
import { getSiteSettings } from "@/lib/data";
import { contactOf, requireAccount } from "@/lib/portal/auth";
import { LiveRefresh } from "@/components/portal/LiveRefresh";
import { BookingsList, type BookingRow } from "@/components/portal/home/BookingsList";
import { StatTiles, type Stat } from "@/components/portal/home/StatTiles";
import { StartRequests } from "@/components/portal/StartRequests";
import { YourWork } from "@/components/portal/YourWork";
import { normalizeServices, serviceSummary, SLOTS } from "@/lib/portal/booking";
import { projectCovers } from "@/lib/portal/covers";
import { requestConfig } from "@/lib/portal/requests";
import {
  clientStatus,
  SHOOT_SERVICE_LABEL,
  shootDay,
  statusLabel,
  type Project,
} from "@/lib/portal/projects";
import { isManager, seesMoney } from "@/lib/portal/shell";

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
    cfg,
    { data: billingRow },
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
          .select("id, number, due_on, status")
          .eq("account_id", a.id)
          .neq("status", "paid")
          .order("due_on")
      : Promise.resolve({ data: [] }),
    requestConfig(db, current),
    // The same read the Billing page makes: only for those who see prices (the fourth tile).
    seesMoney(current)
      ? db.rpc("my_billing", { p_account: a.id })
      : Promise.resolve({ data: null }),
  ]);

  const unpaid = (invoiceRows ?? []) as Pick<Invoice, "id" | "number" | "due_on" | "status">[];
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
  const openInvites = invites.count ?? 0;

  // ---- Bookings (shoots), their thumbnails and prices ----
  const shoots = projects.filter((p) => p.type === "shoot");
  const money$ = seesMoney(current);
  const [covers, { data: itemRows }] = await Promise.all([
    projectCovers(
      db,
      shoots
        .filter((p) => p.delivered_at || ["delivered", "completed"].includes(p.status))
        .map((p) => p.id),
    ),
    // Line items come back only for those who see billing; included items are priced at 0, so a
    // booking covered by the package shows no price at all.
    money$ && shoots.length
      ? db
          .from("line_items")
          .select("project_id, qty, unit_price, currency")
          .in(
            "project_id",
            shoots.map((p) => p.id),
          )
      : Promise.resolve({ data: null }),
  ]);
  const sums = new Map<string, { t: number; c: string }>();
  for (const i of itemRows ?? []) {
    const x = sums.get(i.project_id) ?? { t: 0, c: i.currency };
    x.t += Number(i.qty) * Number(i.unit_price);
    sums.set(i.project_id, x);
  }
  const chipOf = (p: Project) =>
    p.status === "cancelled"
      ? "cancelled"
      : p.revision_state === "requested" || p.revision_state === "in_progress"
        ? "revision"
        : p.status;
  const rows: BookingRow[] = shoots.map((p) => {
    const b = p.meta.booking;
    const services = b ? normalizeServices(b.services) : [];
    const sum = sums.get(p.id);
    return {
      id: p.id,
      href: `/portal/shoots/${encodeURIComponent(p.ref)}`,
      ref: p.ref,
      title: `${p.title}${p.meta.unit ? ` · ${p.meta.unit}` : ""}`,
      when: [
        shootDay(p.shoot_date),
        SLOTS.find(([k]) => k === (p.slot ?? "").toLowerCase().replace(" ", "_"))?.[1] ?? p.slot,
      ]
        .filter(Boolean)
        .join(" · "),
      service: b
        ? services.map((s) => serviceSummary(s, cfg.pricing)).join(" · ")
        : (p.meta.services ?? []).map((s) => SHOOT_SERVICE_LABEL[s] ?? s).join(" · "),
      chip: chipOf(p),
      status: clientStatus(p),
      gold: p.status === "delivered",
      price: sum && sum.t > 0 ? money(sum.c, sum.t) : "",
      cover: covers.get(p.id) ?? null,
      icon: services.length && services.every((s) => s.service === "videos") ? "video" : "photo",
    };
  });

  // ---- The four tiles ----
  const upcoming = shoots.filter(
    (p) =>
      (p.status === "requested" || p.status === "confirmed") &&
      (!p.shoot_date || p.shoot_date >= cfg.today),
  ).length;
  const editing = projects.filter(
    (p) => p.status === "editing" || p.status === "in_editing",
  ).length;
  const stats: Stat[] = [
    { icon: "calendar", value: String(upcoming), label: "Upcoming" },
    { icon: "clock", value: String(editing), label: "In editing" },
    { icon: "download", value: String(waiting.length), label: "Ready to download" },
  ];
  const bill = billingRow as MyBilling | null;
  if (bill?.mode === "package" && bill.plan?.usage.length) {
    const used = bill.plan.usage.reduce((n, u) => n + Number(u.used), 0);
    const qty = bill.plan.usage.reduce((n, u) => n + Number(u.qty), 0);
    stats.push({ icon: "billing", value: `${used} of ${qty}`, label: "Package used" });
  } else if (bill?.budget) {
    stats.push({
      icon: "billing",
      value: money(bill.currency, Number(bill.budget.total)),
      label: "Spent this month",
    });
  } else if (bill?.activity) {
    stats.push({
      icon: "billing",
      value: money(
        bill.currency,
        bill.activity.reduce((n, r) => n + Number(r.total), 0),
      ),
      label: "Spent this month",
    });
  }
  const offers = [
    cfg.shoots && "Photography, 360° tours and video",
    cfg.editing && "editing for your footage",
    cfg.avatars && "AI avatar videos",
  ].filter(Boolean) as string[];

  return (
    <div className="pt-home">
      <LiveRefresh />
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

      <section className="pt-hm-banner" aria-labelledby="hm-h">
        <div>
          <span className="pt-eb">{a.name}</span>
          <h1 id="hm-h" className="pt-h1">
            {cfg.shoots ? "Your next listing deserves a great shoot." : "What are we making next?"}
          </h1>
          {offers.length > 0 && (
            <p className="pt-meta">
              {offers.join(", ").replace(/^./, (c) => c.toUpperCase())}. Start in a few clicks.
            </p>
          )}
        </div>
        <StartRequests cfg={cfg} />
      </section>

      <StatTiles stats={stats} />

      {/* Only when something needs them (owner, 10 Oct 2026). */}
      {waiting.length + scripts.length + onHold.length + unpaid.length + openInvites > 0 && (
        <section className="pt-card" aria-labelledby="attn">
          <h2 id="attn" className="pt-h2">
            Needs your attention
          </h2>
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
                    {p.revision_state === "delivered"
                      ? "Revision delivered"
                      : "Your files are ready"}
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
      )}

      {cfg.shoots && <BookingsList rows={rows} />}
      <YourWork projects={projects} cfg={cfg} shoots={false} />

      <section className="pt-card" aria-labelledby="act">
        <h2 id="act" className="pt-h2">
          Recent activity
        </h2>
        {events.length ? (
          <ul className="pt-activity" data-testid="activity">
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
    </div>
  );
}
