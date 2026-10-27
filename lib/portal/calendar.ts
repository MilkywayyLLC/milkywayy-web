import { createHmac } from "node:crypto";

/**
 * The private calendar feed of shoot bookings (owner, 10 Oct 2026), for Google Calendar's "From
 * URL". Its address carries a token derived from PORTAL_ADMIN_SECRET: anyone with the link can
 * read the bookings, so it's shown only to the Owner; changing the secret changes the link.
 */
export function calendarToken() {
  const s = process.env.PORTAL_ADMIN_SECRET;
  return s
    ? createHmac("sha256", s).update("milkywayy-calendar-feed").digest("hex").slice(0, 40)
    : null;
}

/**
 * One shoot as a calendar event (phase 1, 27 Oct 2026): the real start time (Dubai, fixed +04:00) and
 * a length from the booking (content shoots by their hours or half/full day; property shoots 2 hours).
 */
export type ShootEvent = {
  uid: string;
  title: string;
  date: string;
  start: string | null;
  hours: number;
  location?: string | null;
  description?: string;
  tentative?: boolean;
};

/** Hours on site: content by length (2/4/8 h), a half/full day, else 2 hours for a property shoot. */
export function shootHours(p: {
  slot?: string | null;
  meta?: { booking?: { services?: unknown[] } | null } | null;
}) {
  const svcs = (p.meta?.booking?.services ?? []) as {
    service?: string;
    videos?: { by?: string; hours?: number; day?: string };
  }[];
  const v = svcs.find((x) => x.service === "videos")?.videos;
  if (v?.hours) return Number(v.hours);
  if (v?.day === "full" || /full/i.test(p.slot ?? "")) return 8;
  if (v?.day === "half") return 4;
  return 2;
}

const at = (date: string, hhmm: string, plusHours = 0) =>
  new Date(new Date(`${date}T${hhmm}:00+04:00`).getTime() + plusHours * 36e5);

function eventLines(e: ShootEvent, now: string) {
  const start = e.start ?? "09:00";
  return [
    "BEGIN:VEVENT",
    `UID:${e.uid}@milkywayy.com`,
    `DTSTAMP:${now}`,
    `DTSTART:${stamp(at(e.date, start))}`,
    `DTEND:${stamp(at(e.date, start, e.hours))}`,
    fold(`SUMMARY:${esc(e.title)}`),
    ...(e.location ? [fold(`LOCATION:${esc(e.location)}`)] : []),
    ...(e.description ? [fold(`DESCRIPTION:${esc(e.description)}`)] : []),
    `STATUS:${e.tentative ? "TENTATIVE" : "CONFIRMED"}`,
    "END:VEVENT",
  ];
}

/** A single-event .ics file ("Add to calendar"), which Apple, Outlook and Google all open. */
export function icsOne(e: ShootEvent) {
  return (
    [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Milkywayy//Shoot//EN",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      ...eventLines(e, stamp(new Date())),
      "END:VCALENDAR",
    ].join("\r\n") + "\r\n"
  );
}

/** Google Calendar's "add event" link for the same event. */
export function googleCalendarUrl(e: ShootEvent) {
  const start = e.start ?? "09:00";
  const q = new URLSearchParams({
    action: "TEMPLATE",
    text: e.title,
    dates: `${stamp(at(e.date, start))}/${stamp(at(e.date, start, e.hours))}`,
    ctz: "Asia/Dubai",
    ...(e.location ? { location: e.location } : {}),
    ...(e.description ? { details: e.description } : {}),
  });
  return `https://calendar.google.com/calendar/render?${q.toString()}`;
}

/** The .ics link for a shoot, signed so it works from an email without signing in. */
export function icsPath(id: string) {
  const s = process.env.PORTAL_ADMIN_SECRET;
  if (!s) return null;
  const t = createHmac("sha256", s).update(`ics:${id}`).digest("hex").slice(0, 24);
  return `/api/shoot-ics/${id}?t=${t}`;
}
export const icsTokenOk = (id: string, t: string | null) => {
  const want = icsPath(id);
  return !!want && !!t && want.endsWith(`?t=${t}`);
};

const esc = (s: string) =>
  s.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
const fold = (line: string) => {
  const out: string[] = [];
  for (let i = 0; i < line.length; i += 74) out.push((i ? " " : "") + line.slice(i, i + 74));
  return out.join("\r\n");
};
const stamp = (d: Date) =>
  d
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");

export type CalendarShoot = {
  id: string;
  ref: string;
  title: string;
  status: string;
  shoot_date: string;
  slot: string | null;
  start: string | null;
  hours: number;
  client: string | null;
  address: string | null;
};

/** An iCalendar feed: one event per shoot, in Dubai time (no daylight saving: fixed +04:00). */
export function icsFeed(shoots: CalendarShoot[], origin: string) {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Milkywayy//Shoot bookings//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:Milkywayy shoots",
    "X-WR-TIMEZONE:Asia/Dubai",
  ];
  const now = stamp(new Date());
  for (const s of shoots)
    lines.push(
      ...eventLines(
        {
          uid: s.id,
          title: `${s.status === "requested" ? "[Requested] " : ""}${s.client ? `${s.client}: ` : ""}${s.title}`,
          date: s.shoot_date,
          start: s.start,
          hours: s.hours,
          location: s.address,
          description: `${s.ref} · ${s.status}\n${origin}/admin/projects/${s.id}`,
          tentative: s.status === "requested",
        },
        now,
      ),
    );
  lines.push("END:VCALENDAR");
  return lines.join("\r\n") + "\r\n";
}
