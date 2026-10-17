"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Icon } from "../Icon";

/*
 * The Schedule step's calendar (UI rebuild, 17 Oct 2026): the same month grid as the date picker,
 * shown inline. Dates are YYYY-MM-DD, worked out in UTC so there's no time zone drift. Days before
 * `min` (today in Dubai) can't be chosen. Arrow keys move by day and week, Home/End to the week's
 * ends, Page Up/Down by month; Enter or Space picks.
 */
const pad = (n: number) => String(n).padStart(2, "0");
const iso = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const parse = (s: string) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};
const addDays = (s: string, n: number) => {
  const d = parse(s);
  d.setUTCDate(d.getUTCDate() + n);
  return iso(d);
};
const addMonths = (s: string, n: number) => {
  const d = parse(s);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + n);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return iso(d);
};
const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
const longDate = (s: string) =>
  parse(s).toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

export function DateCalendar({
  value,
  min,
  onChange,
}: {
  value: string;
  /** The first day that can be chosen. */
  min: string;
  onChange: (v: string) => void;
}) {
  const [focus, setFocus] = useState(value || min);
  const moved = useRef(false);
  const grid = useRef<HTMLDivElement>(null);

  // Keep focus on the day the keyboard moved to (including across months).
  useEffect(() => {
    if (!moved.current) return;
    moved.current = false;
    grid.current?.querySelector<HTMLButtonElement>(`[data-day="${focus}"]`)?.focus();
  }, [focus]);

  const month = focus.slice(0, 7);
  const first = parse(`${month}-01`);
  const lead = (first.getUTCDay() + 6) % 7; // Monday first
  const days = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  const cells: (string | null)[] = [
    ...Array<null>(lead).fill(null),
    ...Array.from({ length: days }, (_, i) => `${month}-${pad(i + 1)}`),
  ];
  while (cells.length % 7) cells.push(null);
  const atMin = month <= min.slice(0, 7);

  const go = (to: string, keyboard = false) => {
    moved.current = keyboard;
    setFocus(to < min ? min : to);
  };
  const onKey = (e: KeyboardEvent) => {
    const dow = (parse(focus).getUTCDay() + 6) % 7;
    const map: Record<string, string> = {
      ArrowLeft: addDays(focus, -1),
      ArrowRight: addDays(focus, 1),
      ArrowUp: addDays(focus, -7),
      ArrowDown: addDays(focus, 7),
      PageUp: addMonths(focus, -1),
      PageDown: addMonths(focus, 1),
      Home: addDays(focus, -dow),
      End: addDays(focus, 6 - dow),
    };
    if (e.key in map) {
      e.preventDefault();
      go(map[e.key], true);
    }
  };

  return (
    <div className="pt-bk-cal" role="group" aria-label="Date" data-field="date">
      <div className="pt-bk-cal-head">
        <button
          type="button"
          className="pt-icon-btn"
          aria-label="Previous month"
          disabled={atMin}
          onClick={() => go(addMonths(focus, -1))}
        >
          <Icon name="back" size={16} />
        </button>
        <b aria-live="polite">
          {first.toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" })}
        </b>
        <button
          type="button"
          className="pt-icon-btn"
          aria-label="Next month"
          onClick={() => go(addMonths(focus, 1))}
        >
          <Icon name="chevron" size={16} />
        </button>
      </div>
      <div className="pt-bk-cal-grid" ref={grid} onKeyDown={onKey}>
        {WEEKDAYS.map((w) => (
          <span key={w} className="pt-bk-cal-wd" aria-hidden="true">
            {w}
          </span>
        ))}
        {cells.map((d, i) =>
          d ? (
            <button
              key={d}
              type="button"
              data-day={d}
              className="pt-bk-cal-day"
              tabIndex={d === focus ? 0 : -1}
              disabled={d < min}
              aria-label={longDate(d)}
              aria-pressed={d === value}
              data-today={d === min ? "" : undefined}
              onFocus={() => setFocus(d)}
              onClick={() => onChange(d)}
            >
              {Number(d.slice(8))}
            </button>
          ) : (
            <span key={`x${i}`} aria-hidden="true" />
          ),
        )}
      </div>
    </div>
  );
}
