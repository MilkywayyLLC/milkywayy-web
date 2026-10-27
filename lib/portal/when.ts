/**
 * The one way a shoot's time is shown (phase 1, 27 Oct 2026): the real date and start time,
 * "Wed 29 Oct · 10:15", never Morning / Afternoon / Evening. Used by the portal, admin, emails and
 * calendar links. Old bookings with only a slot get its start (Morning 09:00, Afternoon 14:00).
 */
const SLOT_START: Record<string, string> = {
  morning: "09:00",
  Morning: "09:00",
  afternoon: "14:00",
  Afternoon: "14:00",
  evening: "17:00",
  Evening: "17:00",
  full_day: "09:00",
  "Full day": "09:00",
};

/** HH:MM from a stored start time, else the old slot's start, else null. */
export function startOf(start?: string | null, slot?: string | null) {
  if (start && /^([01]\d|2[0-3]):[0-5]\d/.test(start)) return start.slice(0, 5);
  return slot ? (SLOT_START[slot] ?? null) : null;
}

const DAY = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});
const DAY_Y = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

/** "Wed 29 Oct" (the year only when it isn't this year). Dates are YYYY-MM-DD, Dubai days. */
export function dayLabel(date: string | null | undefined, now = new Date()) {
  if (!date || !/^\d{4}-\d{2}-\d{2}/.test(date)) return "";
  const d = new Date(`${date.slice(0, 10)}T00:00:00Z`);
  const f = date.slice(0, 4) === String(now.getUTCFullYear()) ? DAY : DAY_Y;
  return f.format(d).replace(",", "");
}

/** "Wed 29 Oct · 10:15" (or just the day when there's no time). */
export function whenLabel(
  date: string | null | undefined,
  start?: string | null,
  slot?: string | null,
  now?: Date,
) {
  const d = dayLabel(date, now);
  const t = startOf(start, slot);
  return d ? (t ? `${d} · ${t}` : d) : "";
}

type WithStart = {
  shoot_date?: string | null;
  slot?: string | null;
  meta?: { booking?: { start_time?: string | null } | null; start_time?: string | null } | null;
};
/** A project's start time: the booking's, else one set by the admin, else the old slot's start. */
export const projectStart = (p: WithStart) =>
  startOf(p.meta?.booking?.start_time ?? p.meta?.start_time ?? null, p.slot);
/** "Wed 29 Oct · 10:15" for a project. */
export const projectWhen = (p: WithStart, now?: Date) =>
  whenLabel(p.shoot_date, projectStart(p), null, now);
