/**
 * Calendar helpers for the booking builder. Dates are ISO strings (yyyy-mm-dd) and all maths is
 * done in UTC on date-only values, so there are no time-zone day shifts. "Today" is Dubai time.
 */

export interface BookingWindow {
  /** First bookable day (tomorrow in Dubai). */
  first: string;
  /** Last bookable day. */
  last: string;
  closedWeekdays: number[];
}

const toDate = (iso: string) => new Date(`${iso}T00:00:00Z`);
const toISO = (d: Date) => d.toISOString().slice(0, 10);

/** Today's date in Dubai (UTC+4, no daylight saving). */
export function dubaiToday(now: Date) {
  return toISO(new Date(now.getTime() + 4 * 60 * 60 * 1000));
}

export function addDays(iso: string, n: number) {
  const d = toDate(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return toISO(d);
}

export const weekday = (iso: string) => toDate(iso).getUTCDay();

export function isBookable(iso: string, w: BookingWindow) {
  return iso >= w.first && iso <= w.last && !w.closedWeekdays.includes(weekday(iso));
}

/** Booking window from today: tomorrow → today + windowDays. */
export function bookingWindow(
  today: string,
  windowDays: number,
  closedWeekdays: number[],
): BookingWindow {
  return { first: addDays(today, 1), last: addDays(today, windowDays), closedWeekdays };
}

/** The first day in the window we actually shoot. */
export function firstBookable(w: BookingWindow) {
  let d = w.first;
  for (let i = 0; i < 14 && !isBookable(d, w); i++) d = addDays(d, 1);
  return d;
}

/** Weeks (Monday first) of a month; days outside the month are null. `month` is 0-based. */
export function monthWeeks(year: number, month: number): (string | null)[][] {
  const first = new Date(Date.UTC(year, month, 1));
  const lead = (first.getUTCDay() + 6) % 7; // Monday = 0
  const days = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const cells: (string | null)[] = Array(lead).fill(null);
  for (let d = 1; d <= days; d++) cells.push(toISO(new Date(Date.UTC(year, month, d))));
  while (cells.length % 7) cells.push(null);
  const weeks: (string | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

export const monthOf = (iso: string) => {
  const d = toDate(iso);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() };
};

export const monthLabel = (year: number, month: number) =>
  new Date(Date.UTC(year, month, 1)).toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

/** "Thursday 1 October 2026", for screen readers. */
export const longDate = (iso: string) =>
  toDate(iso).toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
