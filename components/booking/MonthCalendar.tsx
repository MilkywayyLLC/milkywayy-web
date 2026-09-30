"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import {
  addDays,
  isBookable,
  longDate,
  monthLabel,
  monthOf,
  monthWeeks,
  type BookingWindow,
} from "@/lib/booking/dates";

const WEEKDAYS = [
  ["Mo", "Monday"],
  ["Tu", "Tuesday"],
  ["We", "Wednesday"],
  ["Th", "Thursday"],
  ["Fr", "Friday"],
  ["Sa", "Saturday"],
  ["Su", "Sunday"],
] as const;

/**
 * Inline month calendar (Monday first). Past days, off days and days beyond the booking window are
 * disabled. Keyboard: arrows move by day/week, Home/End to week start/end, Page Up/Down by month,
 * Enter/Space selects. Unavailable days stay focusable (aria-disabled) so arrow keys can pass them.
 */
export function MonthCalendar({
  value,
  onChange,
  range: w,
  label = "Preferred date",
}: {
  value: string;
  onChange: (iso: string) => void;
  range: BookingWindow;
  label?: string;
}) {
  const [view, setView] = useState(() => monthOf(value || w.first));
  const [focused, setFocused] = useState(value || w.first);
  const moveFocus = useRef(false);
  const grid = useRef<HTMLDivElement>(null);

  const firstMonth = monthOf(w.first);
  const lastMonth = monthOf(w.last);
  const idx = (m: { year: number; month: number }) => m.year * 12 + m.month;
  const canPrev = idx(view) > idx(firstMonth);
  const canNext = idx(view) < idx(lastMonth);

  // Keep focus on the roving day after keyboard moves (including across months).
  useEffect(() => {
    if (!moveFocus.current) return;
    moveFocus.current = false;
    grid.current?.querySelector<HTMLButtonElement>(`[data-iso="${focused}"]`)?.focus();
  }, [focused, view]);

  const shiftMonth = (d: number) => {
    const n = idx(view) + d;
    setView({ year: Math.floor(n / 12), month: n % 12 });
  };

  const go = (iso: string) => {
    if (iso < w.first || iso > w.last) return;
    moveFocus.current = true;
    setFocused(iso);
    const m = monthOf(iso);
    if (idx(m) !== idx(view)) setView(m);
  };

  const onKey = (e: KeyboardEvent, iso: string) => {
    const dow = (new Date(`${iso}T00:00:00Z`).getUTCDay() + 6) % 7;
    const moves: Record<string, number> = {
      ArrowLeft: -1,
      ArrowRight: 1,
      ArrowUp: -7,
      ArrowDown: 7,
      Home: -dow,
      End: 6 - dow,
      PageUp: -28,
      PageDown: 28,
    };
    if (e.key in moves) {
      e.preventDefault();
      go(addDays(iso, moves[e.key]));
    }
  };

  const weeks = monthWeeks(view.year, view.month);
  // The roving tab stop must be a day shown in this month.
  const shown = weeks.flat().filter(Boolean) as string[];
  const tabStop = shown.includes(focused)
    ? focused
    : (shown.find((d) => d === value) ?? shown.find((d) => isBookable(d, w)) ?? shown[0]);

  return (
    <div className="cal" role="group" aria-label={label}>
      <div className="cal-h">
        <button
          type="button"
          className="cal-nav"
          aria-label="Previous month"
          disabled={!canPrev}
          onClick={() => shiftMonth(-1)}
        >
          ‹
        </button>
        <span className="cal-m" aria-live="polite">
          {monthLabel(view.year, view.month)}
        </span>
        <button
          type="button"
          className="cal-nav"
          aria-label="Next month"
          disabled={!canNext}
          onClick={() => shiftMonth(1)}
        >
          ›
        </button>
      </div>
      <div className="cal-g" ref={grid}>
        {WEEKDAYS.map(([short, full]) => (
          <abbr key={short} className="cal-wd" title={full} aria-hidden="true">
            {short}
          </abbr>
        ))}
        {weeks.flat().map((iso, i) =>
          iso ? (
            <button
              key={iso}
              type="button"
              data-iso={iso}
              className="cal-d"
              aria-label={`${longDate(iso)}${isBookable(iso, w) ? "" : ", unavailable"}`}
              aria-pressed={iso === value}
              aria-disabled={!isBookable(iso, w) || undefined}
              tabIndex={iso === tabStop ? 0 : -1}
              onClick={() => {
                if (!isBookable(iso, w)) return;
                setFocused(iso);
                onChange(iso);
              }}
              onKeyDown={(e) => onKey(e, iso)}
            >
              {Number(iso.slice(8))}
            </button>
          ) : (
            <span key={`x${i}`} aria-hidden="true" />
          ),
        )}
      </div>
    </div>
  );
}
