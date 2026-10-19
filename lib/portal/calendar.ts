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

const SLOT_HOURS: Record<string, [number, number]> = {
  Morning: [9, 13],
  Afternoon: [14, 18],
  "Full day": [9, 18],
  Evening: [17, 21],
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
  for (const s of shoots) {
    const [h1, h2] = SLOT_HOURS[s.slot ?? ""] ?? [9, 18];
    const at = (h: number) =>
      stamp(new Date(`${s.shoot_date}T${String(h).padStart(2, "0")}:00:00+04:00`));
    lines.push(
      "BEGIN:VEVENT",
      `UID:${s.id}@milkywayy.com`,
      `DTSTAMP:${now}`,
      `DTSTART:${at(h1)}`,
      `DTEND:${at(h2)}`,
      fold(
        `SUMMARY:${esc(`${s.status === "requested" ? "[Requested] " : ""}${s.client ? `${s.client}: ` : ""}${s.title}`)}`,
      ),
      ...(s.address ? [fold(`LOCATION:${esc(s.address)}`)] : []),
      fold(
        `DESCRIPTION:${esc(`${s.ref} · ${s.slot ?? ""} · ${s.status}\n${origin}/admin/projects/${s.id}`)}`,
      ),
      `STATUS:${s.status === "requested" ? "TENTATIVE" : "CONFIRMED"}`,
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return lines.join("\r\n") + "\r\n";
}
