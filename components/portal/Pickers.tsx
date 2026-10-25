"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { Icon } from "./Icon";

/**
 * Date and time pickers in the portal's own look (owner, 17 Oct 2026), replacing the browser's
 * date and time inputs in Book media. Both are a trigger that looks like an input and a popover
 * inside the modal (so the dialog's focus trap and Esc stack still work): a month calendar with
 * past dates disabled, and an iOS-style scroll-snap wheel (hours, then 00/15/30/45). Arrow keys,
 * Enter and Esc work; a click outside closes.
 */

/** Close on a pointer down outside `ref` (the popover and its trigger). */
function useOutside(ref: React.RefObject<HTMLElement | null>, open: boolean, close: () => void) {
  useEffect(() => {
    if (!open) return;
    const down = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    };
    document.addEventListener("pointerdown", down, true);
    return () => document.removeEventListener("pointerdown", down, true);
  }, [ref, open, close]);
}

/* ---------- dates as YYYY-MM-DD, worked out in UTC (no time zone drift) ---------- */

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
const monthOf = (s: string) => s.slice(0, 7);
const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
const longDate = (s: string) =>
  parse(s).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });

export function DatePicker({
  value,
  min,
  onChange,
  invalid,
  describedBy,
  labelledBy,
}: {
  value: string;
  /** The first day that can be chosen (today in Dubai). */
  min: string;
  onChange: (v: string) => void;
  invalid?: boolean;
  describedBy?: string;
  labelledBy?: string;
}) {
  const [open, setOpen] = useState(false);
  const [focus, setFocus] = useState(value || min);
  const wrap = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const grid = useRef<HTMLDivElement>(null);
  const id = useId();
  const close = useCallback((back = false) => {
    setOpen(false);
    if (back) trigger.current?.focus();
  }, []);
  useOutside(wrap, open, close);

  // Focus follows the keyboard's day.
  useEffect(() => {
    if (!open) return;
    grid.current?.querySelector<HTMLButtonElement>(`[data-day="${focus}"]`)?.focus();
  }, [open, focus]);

  const show = monthOf(focus);
  const first = parse(`${show}-01`);
  const lead = (first.getUTCDay() + 6) % 7; // Monday first
  const days = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  const cells: (string | null)[] = [
    ...Array<null>(lead).fill(null),
    ...Array.from({ length: days }, (_, i) => `${show}-${pad(i + 1)}`),
  ];
  while (cells.length % 7) cells.push(null);
  const weeks = Array.from({ length: cells.length / 7 }, (_, i) => cells.slice(i * 7, i * 7 + 7));
  const atMin = show <= monthOf(min);

  const move = (to: string) => setFocus(to < min ? min : to);
  function key(e: React.KeyboardEvent) {
    const k = e.key;
    const map: Record<string, () => string> = {
      ArrowLeft: () => addDays(focus, -1),
      ArrowRight: () => addDays(focus, 1),
      ArrowUp: () => addDays(focus, -7),
      ArrowDown: () => addDays(focus, 7),
      PageUp: () => addMonths(focus, -1),
      PageDown: () => addMonths(focus, 1),
      Home: () => addDays(focus, -((parse(focus).getUTCDay() + 6) % 7)),
      End: () => addDays(focus, 6 - ((parse(focus).getUTCDay() + 6) % 7)),
    };
    if (map[k]) {
      e.preventDefault();
      move(map[k]());
    } else if (k === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      close(true);
    }
  }
  const pick = (d: string) => {
    onChange(d);
    close(true);
  };

  return (
    <div className="pt-dp-wrap" ref={wrap}>
      <button
        ref={trigger}
        type="button"
        className="pt-dp"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        data-invalid={invalid ? "" : undefined}
        aria-describedby={describedBy}
        aria-labelledby={labelledBy}
        data-empty={value ? undefined : ""}
        onClick={() => {
          setFocus(value || min);
          setOpen((o) => !o);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" && !open) {
            e.preventDefault();
            setFocus(value || min);
            setOpen(true);
          }
        }}
      >
        <span className="pt-dp-v">{value ? longDate(value) : "Choose a date"}</span>
        <Icon name="calendar" size={18} />
      </button>
      {open && (
        <div className="pt-pop-panel pt-cal" id={id} role="dialog" aria-label="Choose a date">
          <div className="pt-cal-head">
            <button
              type="button"
              className="pt-cal-nav"
              aria-label="Previous month"
              disabled={atMin}
              onClick={() => move(addMonths(focus, -1))}
            >
              <Icon name="back" size={16} />
            </button>
            <b aria-live="polite">
              {first.toLocaleDateString("en-GB", {
                month: "long",
                year: "numeric",
                timeZone: "UTC",
              })}
            </b>
            <button
              type="button"
              className="pt-cal-nav"
              aria-label="Next month"
              onClick={() => move(addMonths(focus, 1))}
            >
              <Icon name="chevron" size={16} />
            </button>
          </div>
          <div className="pt-cal-grid" role="grid" ref={grid} onKeyDown={key}>
            <div role="row" className="pt-cal-row">
              {WEEKDAYS.map((w) => (
                <span key={w} role="columnheader" className="pt-cal-wd">
                  {w}
                </span>
              ))}
            </div>
            {weeks.map((w, i) => (
              <div role="row" className="pt-cal-row" key={i}>
                {w.map((d, j) =>
                  d ? (
                    <span role="gridcell" key={d} aria-selected={d === value}>
                      <button
                        type="button"
                        data-day={d}
                        className="pt-cal-day"
                        tabIndex={d === focus ? 0 : -1}
                        disabled={d < min}
                        aria-label={longDate(d)}
                        aria-pressed={d === value}
                        data-today={d === min ? "" : undefined}
                        onClick={() => pick(d)}
                        onFocus={() => setFocus(d)}
                      >
                        {Number(d.slice(8))}
                      </button>
                    </span>
                  ) : (
                    <span role="gridcell" key={`x${j}`} />
                  ),
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- the date strip (Book media, V2 reskin) ---------- */

const STRIP_DAYS = 90;
const stripDay = (s: string, o: Intl.DateTimeFormatOptions) =>
  parse(s).toLocaleDateString("en-GB", { ...o, timeZone: "UTC" });

/** A horizontal row of the next 90 days from `min`: weekday, day and month; one tap picks it. */
export function DateStrip({
  value,
  min,
  onChange,
  invalid,
  labelledBy,
}: {
  value: string;
  min: string;
  onChange: (v: string) => void;
  invalid?: boolean;
  labelledBy?: string;
}) {
  const row = useRef<HTMLDivElement>(null);
  const days = Array.from({ length: STRIP_DAYS }, (_, i) => addDays(min, i));
  // A chosen day outside the strip (an older booking) still shows, first.
  if (value && !days.includes(value)) days.unshift(value);
  useLayoutEffect(() => {
    const el = row.current?.querySelector<HTMLElement>("[aria-pressed='true']");
    if (el && row.current) row.current.scrollLeft = el.offsetLeft - row.current.offsetLeft - 8;
  }, []);
  return (
    <div
      className="pt-strip"
      ref={row}
      role="group"
      aria-labelledby={labelledBy}
      data-invalid={invalid ? "" : undefined}
    >
      {days.map((d) => (
        <button
          key={d}
          type="button"
          aria-pressed={d === value}
          aria-label={longDate(d)}
          onClick={() => onChange(d)}
        >
          <small>{stripDay(d, { weekday: "short" })}</small>
          <b>{stripDay(d, { day: "numeric" })}</b>
          <small>{stripDay(d, { month: "short" })}</small>
        </button>
      ))}
    </div>
  );
}

/* ---------- the time wheel ---------- */

const ROW = 48;
export const MINUTES = ["00", "15", "30", "45"] as const;

/** Copies of a looping column's items: scrolling past the end comes round to the start. */
const COPIES = 9;
const MID = Math.floor(COPIES / 2);

/** One scroll-snap column: the centred item is the value; arrows and a tap move it. With `loop`
 *  the items repeat (after 17 comes 08 again) and the column recentres itself when it settles. */
function Wheel({
  items,
  value,
  onChange,
  label,
  onDone,
  loop = false,
}: {
  items: string[];
  value: string;
  onChange: (v: string) => void;
  label: string;
  onDone: () => void;
  loop?: boolean;
}) {
  const col = useRef<HTMLDivElement>(null);
  const timer = useRef<number | undefined>(undefined);
  /** A scroll we started (keys, a tap): it lands on the value, so it never picks one itself. */
  const ours = useRef(false);
  const id = useId();
  const len = items.length;
  const idx = Math.max(0, items.indexOf(value));
  const rows = loop ? Array.from({ length: COPIES * len }, (_, i) => items[i % len]) : items;
  const home = (i: number) => (loop ? MID * len + i : i);
  /** Where the column is, in rows (with `loop`, a position in the repeated list). */
  const pos = useRef(home(idx));

  // Start on the value without an animation.
  useLayoutEffect(() => {
    pos.current = home(idx);
    if (col.current) col.current.scrollTop = pos.current * ROW;
    // only when the column mounts or its items change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items.join()]);

  /** A looping column far from the middle copy jumps back to it (same item, no animation). */
  const recentre = (el: HTMLDivElement, n: number) => {
    if (!loop) return n;
    const copy = Math.floor(n / len);
    if (copy >= 2 && copy <= COPIES - 3) return n;
    const m = home(((n % len) + len) % len);
    el.scrollTop = m * ROW;
    return m;
  };
  const go = (i: number) => {
    const n = Math.min(rows.length - 1, Math.max(0, i));
    const el = col.current;
    pos.current = n;
    if (el) {
      ours.current = true;
      el.scrollTo({ top: n * ROW, behavior: "smooth" });
      // Where smooth scrolling doesn't run (reduced motion, a background tab): land anyway.
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => {
        el.scrollTop = n * ROW;
        pos.current = recentre(el, n);
        ours.current = false;
      }, 350);
    }
    if (rows[n] !== value) onChange(rows[n]);
  };
  const onScroll = () => {
    if (ours.current) return;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      const el = col.current;
      if (!el) return;
      const n = Math.min(rows.length - 1, Math.max(0, Math.round(el.scrollTop / ROW)));
      pos.current = recentre(el, n);
      if (rows[n] !== value) onChange(rows[n]);
    }, 90);
  };
  useEffect(() => () => window.clearTimeout(timer.current), []);

  return (
    <div
      ref={col}
      className="pt-wheel-col"
      role="listbox"
      tabIndex={0}
      aria-label={label}
      aria-activedescendant={`${id}-${idx}`}
      onScroll={onScroll}
      onKeyDown={(e) => {
        if (e.key === "ArrowUp" || e.key === "ArrowDown") {
          e.preventDefault();
          go((loop ? pos.current : idx) + (e.key === "ArrowUp" ? -1 : 1));
        } else if (e.key === "Home" || e.key === "End") {
          e.preventDefault();
          go(home(e.key === "Home" ? 0 : len - 1));
        } else if (e.key === "Enter") {
          e.preventDefault();
          onDone();
        }
      }}
    >
      {rows.map((it, i) => {
        // One copy carries the options for assistive tech; the repeats are decoration.
        const real = !loop || Math.floor(i / len) === MID;
        return (
          <div
            key={i}
            id={real ? `${id}-${i % len}` : undefined}
            role={real ? "option" : undefined}
            aria-hidden={real ? undefined : true}
            aria-selected={real ? it === value : undefined}
            data-on={it === value ? "" : undefined}
            className="pt-wheel-item"
            onClick={() => go(i)}
          >
            {it}
          </div>
        );
      })}
    </div>
  );
}

/** Hours (step 1) and quarter hours between `from` and `to` (HH:MM, both on a quarter). */
export function TimeWheel({
  value,
  from,
  to,
  onChange,
  describedBy,
  labelledBy,
  placeholder = "Any time",
  clearable = true,
  invalid,
  loop = false,
  label = "Start time",
}: {
  value: string;
  from: string;
  to: string;
  /** Looping hour and minute columns (Book media, V2 reskin). */
  loop?: boolean;
  label?: string;
  onChange: (v: string) => void;
  describedBy?: string;
  labelledBy?: string;
  /** Shown while empty. */
  placeholder?: string;
  /** A Clear button (off when a time is required). */
  clearable?: boolean;
  invalid?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const first = useRef<HTMLDivElement>(null);
  const id = useId();
  const close = useCallback((back = false) => {
    setOpen(false);
    if (back) trigger.current?.focus();
  }, []);
  useOutside(wrap, open, close);

  const h1 = Number(from.slice(0, 2));
  const h2 = Number(to.slice(0, 2));
  const hours = Array.from({ length: h2 - h1 + 1 }, (_, i) => pad(h1 + i));
  const okMinute = (h: string, m: string) => `${h}:${m}` >= from && `${h}:${m}` <= to;
  const [hh, mm] = value ? value.split(":") : [hours[0], "00"];
  const minutes = MINUTES.filter((m) => okMinute(hh, m));
  const set = (h: string, m: string) => {
    const mins = MINUTES.filter((x) => okMinute(h, x));
    onChange(`${h}:${mins.includes(m as (typeof MINUTES)[number]) ? m : mins[0]}`);
  };

  useEffect(() => {
    if (open) first.current?.querySelector<HTMLElement>(".pt-wheel-col")?.focus();
  }, [open]);

  return (
    <div className="pt-dp-wrap" ref={wrap}>
      <button
        ref={trigger}
        type="button"
        className="pt-dp"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        aria-describedby={describedBy}
        aria-labelledby={labelledBy}
        data-invalid={invalid ? "" : undefined}
        data-empty={value ? undefined : ""}
        onClick={() => {
          if (!open && !value) set(hours[0], "00");
          setOpen((o) => !o);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" && !open) {
            e.preventDefault();
            if (!value) set(hours[0], "00");
            setOpen(true);
          }
        }}
      >
        <span className="pt-dp-v">{value || placeholder}</span>
        <Icon name="clock" size={18} />
      </button>
      {open && (
        <div
          className="pt-pop-panel pt-wheel"
          id={id}
          role="dialog"
          aria-label={label}
          ref={first}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              e.stopPropagation();
              close(true);
            }
          }}
        >
          <div className="pt-wheel-cols">
            <span className="pt-wheel-band" aria-hidden="true" />
            <Wheel
              items={hours}
              value={hh}
              label="Hour"
              loop={loop}
              onChange={(h) => set(h, mm)}
              onDone={() => close(true)}
            />
            <span className="pt-wheel-sep" aria-hidden="true">
              :
            </span>
            <Wheel
              items={[...minutes]}
              value={mm}
              label="Minutes"
              loop={loop && minutes.length === MINUTES.length}
              onChange={(m) => set(hh, m)}
              onDone={() => close(true)}
            />
          </div>
          <div className="pt-wheel-foot">
            {clearable && (
              <button
                type="button"
                className="btn btn-g btn-s"
                onClick={() => {
                  onChange("");
                  close(true);
                }}
              >
                Clear
              </button>
            )}
            <button type="button" className="btn btn-p btn-s" onClick={() => close(true)}>
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
