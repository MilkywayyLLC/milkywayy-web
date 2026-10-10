import { headers } from "next/headers";
import Link from "next/link";
import { portalAdminPage, type ProjectListRow } from "@/lib/portal/admin";
import { calendarToken } from "@/lib/portal/calendar";
import { originFrom } from "@/lib/portal/invite";
import { dubaiToday } from "@/lib/portal/billing";
import { statusLabel } from "@/lib/portal/projects";

export const metadata = { title: "Shoot calendar" };

const ymd = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Every shoot booking by day (owner, 10 Oct 2026): requested ones dashed until confirmed. The
 * private calendar link adds them to Google Calendar ("Other calendars → From URL").
 */
export default async function ShootCalendar({
  searchParams,
}: {
  searchParams: Promise<{ m?: string }>;
}) {
  const rpc = await portalAdminPage();
  const { m } = await searchParams;
  // Today in Dubai (UTC+4, no daylight saving), as a UTC date at midnight.
  const today = new Date(`${dubaiToday()}T00:00:00Z`);
  const [y, mo] = /^\d{4}-\d{2}$/.test(m ?? "")
    ? m!.split("-").map(Number)
    : [today.getUTCFullYear(), today.getUTCMonth() + 1];
  const first = new Date(Date.UTC(y, mo - 1, 1));
  const start = new Date(first);
  start.setUTCDate(1 - ((first.getUTCDay() + 6) % 7)); // Monday on or before the 1st
  // Whole weeks only: five rows for most months, six when the month needs them.
  const lead = (first.getUTCDay() + 6) % 7;
  const inMonthDays = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  const days = Array.from({ length: Math.ceil((lead + inMonthDays) / 7) * 7 }, (_, i) => {
    const d = new Date(start);
    d.setUTCDate(start.getUTCDate() + i);
    return d;
  });
  const shoots = (await rpc<ProjectListRow[]>("portal_admin_projects", { p_type: "shoot" })).filter(
    (r) => r.shoot_date,
  );
  const byDay = new Map<string, ProjectListRow[]>();
  for (const s of shoots) {
    const k = s.shoot_date!.slice(0, 10);
    byDay.set(k, [...(byDay.get(k) ?? []), s]);
  }
  const shift = (n: number) => {
    const d = new Date(Date.UTC(y, mo - 1 + n, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  };
  const token = calendarToken();
  const feed = token ? `${originFrom(await headers())}/api/portal/calendar/${token}.ics` : null;

  return (
    <div className="ad-page">
      <div className="ad-head">
        <div>
          <Link className="ad-eb" href="/admin/projects?type=shoot" prefetch={false}>
            ← Shoots
          </Link>
          <h1 className="ad-h1">
            {first.toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" })}
          </h1>
        </div>
        <div className="ad-btns">
          <Link className="ad-btn ghost small" href={`?m=${shift(-1)}`} prefetch={false}>
            ← Previous
          </Link>
          <Link className="ad-btn ghost small" href="?" prefetch={false}>
            Today
          </Link>
          <Link className="ad-btn ghost small" href={`?m=${shift(1)}`} prefetch={false}>
            Next →
          </Link>
        </div>
      </div>
      <div className="ad-cal" role="grid" aria-label="Shoots by day" data-testid="calendar">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
          <span key={d} role="columnheader" className="ad-cal-h">
            {d}
          </span>
        ))}
        {days.map((d) => {
          const k = ymd(d);
          const list = byDay.get(k) ?? [];
          const inMonth = d.getUTCMonth() === mo - 1;
          return (
            <div
              key={k}
              role="gridcell"
              className={`ad-cal-day${inMonth ? "" : "out"}${k === ymd(today) ? "today" : ""}`}
              aria-label={`${d.toLocaleDateString("en-GB", { day: "numeric", month: "long", timeZone: "UTC" })}: ${list.length} shoot${list.length === 1 ? "" : "s"}`}
            >
              <span className="ad-cal-n">{d.getUTCDate()}</span>
              {list.map((s) => (
                <Link
                  key={s.id}
                  href={`/admin/projects/${s.id}`}
                  prefetch={false}
                  className={`ad-cal-ev ${s.status}`}
                  title={`${s.ref} · ${s.title} · ${statusLabel(s.status)}`}
                >
                  <b>{s.slot ?? ""}</b> {s.account_name ?? s.client_name ?? s.title}
                </Link>
              ))}
            </div>
          );
        })}
      </div>
      <section className="ad-card" aria-label="Calendar feed">
        <h2 className="ad-h2">Add to Google Calendar</h2>
        {feed ? (
          <>
            <p className="ad-small" style={{ margin: 0 }}>
              Google Calendar → Other calendars → <b>From URL</b>, then paste this private link.
              Anyone with it can see the bookings, so keep it to yourself.
            </p>
            <input readOnly value={feed} aria-label="Private calendar link" data-testid="ics-url" />
          </>
        ) : (
          <p className="ad-small ad-muted">The calendar link needs PORTAL_ADMIN_SECRET.</p>
        )}
      </section>
    </div>
  );
}
