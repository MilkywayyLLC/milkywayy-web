"use client";

import { DatePicker, TimeWheel } from "./Pickers";

/** Booking hours on the arrival wheel (owner, 25 Oct 2026). */
export const WHEEL_FROM = "08:00";
export const WHEEL_TO = "18:45";

/**
 * Date (calendar popover) + Arrival time (looping wheel popover), as in Book media (phase 1, 27 Oct
 * 2026): side by side on desktop, stacked on phones. Used by reschedule (portal and admin) and the
 * admin's "Propose a new time". No keyboard time input.
 */
export function WhenPicker({
  date,
  time,
  min,
  onDate,
  onTime,
  admin = false,
  dateLabel = "Date",
  timeLabel = "Arrival time",
}: {
  date: string;
  time: string;
  min: string;
  onDate: (v: string) => void;
  onTime: (v: string) => void;
  admin?: boolean;
  dateLabel?: string;
  timeLabel?: string;
}) {
  const field = admin ? "ad-field" : "pt-field";
  return (
    <div className={admin ? "ad-when" : "bkp-when bkp-2col pt-whenpick"}>
      <div className={field} role="group" aria-label={dateLabel}>
        <span>{dateLabel}</span>
        <DatePicker value={date} min={min} onChange={onDate} />
      </div>
      <div className={field} role="group" aria-label={timeLabel}>
        <span>{timeLabel}</span>
        <TimeWheel
          value={time}
          from={WHEEL_FROM}
          to={WHEEL_TO}
          placeholder="Choose a time"
          clearable={false}
          loop
          label={timeLabel}
          onChange={onTime}
        />
      </div>
    </div>
  );
}

/** Today in Dubai (YYYY-MM-DD), the first day a picker offers. */
export const dubaiToday = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dubai" }).format(new Date());
