"use client";

import type { Dispatch, ReactNode } from "react";
import {
  isLocked,
  servicePrices,
  TWILIGHT_QTYS,
  twilightNote,
  twilightTable,
  type Action,
  type BookingProperty,
} from "@/lib/booking";
import { money } from "@/lib/portal/billing";
import {
  DAY_LABEL,
  KEY,
  SLOT_HOURS,
  SLOTS,
  VIDEO_LABEL,
  type Slot,
  type VideoPlan,
} from "@/lib/portal/booking";
import type { RequestConfig } from "@/lib/portal/requests";
import { Icon } from "../Icon";
import { DateCalendar } from "./DateCalendar";
import { dayNote, qtyNote, rateText } from "./pricing-ui";

/*
 * The booking page's step screens (UI rebuild, 17 Oct 2026). Presentation only: every control
 * calls the same state and reducer the old modal used, and every price shown comes from the
 * client's own price list (and only for those who see prices).
 */

/** The "Includes" chips; they travel in the booking's existing note. */
export const SHORT_CHIPS = ["Walkthrough reel", "Agent talking head"] as const;
export const LONG_CHIPS = ["Property walkthrough", "Agent talking head"] as const;

const ICONS = {
  apartment:
    "M5 21V4h10v17M15 9h4v12M3 21h18M8 7h1M11 7h1M8 10h1M11 10h1M8 13h1M11 13h1M8 16h1M11 16h1",
  villa: "M3 11l9-7 9 7M5 9.5V20h14V9.5M10 20v-5h4v5",
  commercial: "M3 21h18M4 21V8l8-4 8 4v13M8 11h2M14 11h2M8 15h2M14 15h2",
  photo: "M4 8h3l2-3h6l2 3h3v11H4zM12 16.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z",
  tour: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z",
  reel: "M8 3h8a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zM11 18h2",
  film: "M3 6h18v12H3zM7 6v12M17 6v12M3 10h4M3 14h4M17 10h4M17 14h4",
  morning:
    "M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4",
  afternoon: "M4 18h16M7 18a5 5 0 0 1 10 0M12 7v3M5.6 10.6l1.4 1.4M18.4 10.6 17 12M12 3v1",
  fullday: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 3v18M12 3a9 9 0 0 1 0 18z",
} as const;
export function Glyph({ name }: { name: keyof typeof ICONS }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="24"
      height="24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinejoin="round"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d={ICONS[name]} />
    </svg>
  );
}

/** "09:00" → "9:00 AM". */
export const timeLabel = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
};
/** The hourly arrival times a slot allows (its start-time limits, inclusive). */
export function arrivalTimes(slot: Slot | "") {
  const [from, to] = slot ? SLOT_HOURS[slot] : ["08:00", "17:45"];
  const out: string[] = [];
  for (let h = 0; h < 24; h++) {
    const t = `${String(h).padStart(2, "0")}:00`;
    if (t >= from && t <= to) out.push(t);
  }
  return out;
}

/** A card-sized toggle: a check circle on the right, tinted when on. */
function Toggle({
  on,
  onClick,
  icon,
  title,
  sub,
  testId,
}: {
  on: boolean;
  onClick: () => void;
  icon: ReactNode;
  title: string;
  sub: ReactNode;
  testId?: string;
}) {
  return (
    <button
      type="button"
      className="pt-bk-toggle"
      aria-pressed={on}
      onClick={onClick}
      data-testid={testId}
    >
      <span className="pt-bk-toggle-ic" aria-hidden="true">
        {icon}
      </span>
      <span className="pt-bk-toggle-tx">
        <b>{title}</b>
        <small>{sub}</small>
      </span>
      <span className="pt-bk-tick" aria-hidden="true">
        <Icon name="check" size={14} />
      </span>
    </button>
  );
}

function Counter({
  id,
  label,
  value,
  min = 0,
  max = 100,
  note,
  testId,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  min?: number;
  max?: number;
  note?: string | null;
  testId?: string;
  onChange: (n: number) => void;
}) {
  return (
    <div className="pt-bk-qty" data-testid={testId}>
      <div>
        <span className="pt-field-label" id={id}>
          {label}
        </span>
        {note && <span className="pt-meta pt-mono pt-bk-note">{note}</span>}
      </div>
      <div className="pt-stepper" role="group" aria-labelledby={id}>
        <button
          type="button"
          aria-label={`Fewer: ${label}`}
          disabled={value <= min}
          onClick={() => onChange(Math.max(min, value - 1))}
        >
          −
        </button>
        <output aria-live="polite">{value}</output>
        <button
          type="button"
          aria-label={`More: ${label}`}
          disabled={value >= max}
          onClick={() => onChange(Math.min(max, value + 1))}
        >
          +
        </button>
      </div>
    </div>
  );
}

function Chips({
  label,
  options,
  chosen,
  onToggle,
}: {
  label: string;
  options: readonly string[];
  chosen: string[];
  onToggle: (c: string) => void;
}) {
  return (
    <div className="pt-bk-chips" role="group" aria-label={label}>
      <span className="pt-field-label">{label}</span>
      <div>
        {options.map((c) => (
          <button
            key={c}
            type="button"
            className="pt-bk-chip"
            aria-pressed={chosen.includes(c)}
            onClick={() => onToggle(c)}
          >
            {chosen.includes(c) && <Icon name="check" size={14} />}
            {c}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ---------- 1. Services ---------- */

export type ServicesProps = {
  cfg: RequestConfig;
  turnaround: { photos: string; short: string; long: string };
  photosOn: boolean;
  setPhotosOn: (on: boolean) => void;
  prop: BookingProperty;
  dispatchProp: Dispatch<Action>;
  video: VideoPlan;
  setV: (patch: Partial<VideoPlan>) => void;
  shortOn: boolean;
  longOn: boolean;
  setShortOn: (on: boolean) => void;
  setLongOn: (on: boolean) => void;
  incl: { short: string[]; long: string[] };
  toggleIncl: (k: "short" | "long", chip: string) => void;
  chooseDay: (d: "half" | "full") => void;
  error?: string | null;
};

export function ServicesStep(p: ServicesProps) {
  const { cfg, prop, video } = p;
  const price = !!cfg.price.rates;
  const m = (n: number) => money(cfg.price.currency, n);
  const update = (patch: Partial<BookingProperty>) =>
    p.dispatchProp({ type: "update", id: prop.id, patch });
  const twi = twilightTable(prop, cfg.pricing);
  const prices = servicePrices(prop, cfg.pricing);
  const tourLocked = isLocked(prop, "tour", cfg.pricing);
  const tier = prop.type === "commercial" ? cfg.pricing.commercial.tiers[prop.size] : null;

  const byTime = video.by === "time";
  const day = video.day === "full" ? "full" : "half";
  const firstVideo = p.shortOn ? "short" : "long";

  /** Fixed quantity | Half day | Full day. The plan is one object, so both cards share the mode. */
  const modeCards = (k: "short" | "long") => {
    const per = k === "short" ? "per reel" : "per video";
    const rates = cfg.price.rates;
    const flex = (d: "half" | "full") => {
      if (!rates) return "Flexible";
      if (cfg.price.mode === "package") return "Flexible";
      const v = rates[video.raw ? KEY.raw[d] : KEY.min[d]];
      return v == null ? "Flexible" : `Flexible · ${video.raw ? "" : "from "}${m(Number(v))}`;
    };
    return (
      <div className="pt-bk-modes" role="group" aria-label={`How to book ${VIDEO_LABEL[k].title}`}>
        <button
          type="button"
          aria-pressed={!byTime}
          data-testid={`mode-count-${k}`}
          onClick={() => p.setV({ by: "count", raw: false })}
        >
          <b>Fixed quantity</b>
          <small>{rateText(cfg, KEY[k], per) ?? "Choose how many"}</small>
        </button>
        {(["half", "full"] as const).map((d) => (
          <button
            key={d}
            type="button"
            aria-pressed={byTime && day === d}
            data-testid={`mode-${d}-${k}`}
            onClick={() => p.chooseDay(d)}
          >
            <b>{DAY_LABEL[d]}</b>
            <small>{flex(d)}</small>
          </button>
        ))}
      </div>
    );
  };

  const videoCard = (k: "short" | "long") => {
    const on = k === "short" ? p.shortOn : p.longOn;
    const setOn = k === "short" ? p.setShortOn : p.setLongOn;
    const label = VIDEO_LABEL[k];
    const ta = k === "short" ? p.turnaround.short : p.turnaround.long;
    const rawOn = byTime && !!video.raw;
    return (
      <section
        key={k}
        className="pt-bk-card"
        aria-label={label.title}
        data-testid={k === "short" ? "videos-card" : "walkthrough-card"}
      >
        <Toggle
          on={on}
          onClick={() => setOn(!on)}
          icon={<Glyph name={k === "short" ? "reel" : "film"} />}
          title={k === "short" ? "Short-form reels" : "Walkthrough videos"}
          sub={
            <>
              {label.sub}
              {!rawOn && ta ? ` · Turnaround: ${ta}` : ""}
            </>
          }
        />
        {on && (
          <div className="pt-bk-panel">
            {modeCards(k)}
            <Chips
              label="Includes"
              options={k === "short" ? SHORT_CHIPS : LONG_CHIPS}
              chosen={p.incl[k]}
              onToggle={(c) => p.toggleIncl(k, c)}
            />
            {!byTime ? (
              <>
                <Counter
                  id={`qty-${k}`}
                  label={k === "short" ? "Number of reels" : "Number of videos"}
                  value={(k === "short" ? video.short : video.long) ?? 1}
                  min={1}
                  testId={`qty-${k}`}
                  note={qtyNote(
                    KEY[k],
                    (k === "short" ? video.short : video.long) ?? 0,
                    cfg,
                    "each",
                  )}
                  onChange={(n) => p.setV(k === "short" ? { short: n } : { long: n })}
                />
                {k === "long" && (
                  <Counter
                    id="qty-extra"
                    label="Extra minutes"
                    value={video.extra_min ?? 0}
                    max={600}
                    testId="qty-extra"
                    note={
                      rateText(cfg, KEY.extra, "per extra minute") ??
                      "Longer than 5 min? All walkthroughs together"
                    }
                    onChange={(n) => p.setV({ extra_min: n })}
                  />
                )}
              </>
            ) : k === firstVideo ? (
              <div className="pt-bk-time">
                <p className="pt-meta">
                  A {DAY_LABEL[day].toLowerCase()} covers short-form and walkthrough together.
                </p>
                <label className="pt-bk-check">
                  <input
                    type="checkbox"
                    checked={!!video.raw}
                    data-testid="raw-only"
                    onChange={(e) => p.setV({ raw: e.target.checked })}
                  />
                  <span>Raw files only (no editing)</span>
                </label>
                <label className="pt-field">
                  Roughly how many? (optional)
                  <input
                    value={video.approx ?? ""}
                    maxLength={300}
                    placeholder="About 4 reels and a walkthrough"
                    onChange={(e) => p.setV({ approx: e.target.value })}
                  />
                </label>
                {dayNote(video, cfg) && (
                  <span className="pt-meta pt-mono pt-bk-note" data-testid="day-note">
                    {dayNote(video, cfg)}
                  </span>
                )}
              </div>
            ) : (
              <p className="pt-meta">
                Covered by the same {DAY_LABEL[day].toLowerCase()} as{" "}
                {firstVideo === "short" ? "short-form" : "walkthrough"}.
              </p>
            )}
          </div>
        )}
      </section>
    );
  };

  return (
    <div className="pt-bk-step" data-testid="step-services">
      <h2 className="pt-h2">What do you need?</h2>
      <p className="pt-meta pt-bk-lede">Choose one or more. You’ll set the details next.</p>

      <section className="pt-bk-card" aria-label="Photos" data-field="property">
        <Toggle
          on={p.photosOn}
          onClick={() => p.setPhotosOn(!p.photosOn)}
          icon={<Glyph name="photo" />}
          title="Photography"
          sub={
            <>
              HDR photos, priced by property type and size
              {p.turnaround.photos ? ` · Turnaround: ${p.turnaround.photos}` : ""}
            </>
          }
          testId="photos-toggle"
        />
        {p.photosOn && (
          <div className="pt-bk-panel">
            <div className="pt-bk-addons" role="group" aria-label="Add-ons">
              <span className="pt-field-label">Add-ons</span>
              <div>
                <button
                  type="button"
                  className="pt-bk-addon"
                  aria-pressed={prop.twilight}
                  onClick={() => p.dispatchProp({ type: "toggle", id: prop.id, key: "twilight" })}
                >
                  <b>Twilight images</b>
                  <small>
                    Edited from your daylight shots
                    {price ? ` · from ${m(twi[TWILIGHT_QTYS[0]])}` : ""}
                  </small>
                </button>
                <button
                  type="button"
                  className="pt-bk-addon"
                  aria-pressed={prop.tour}
                  disabled={tourLocked}
                  onClick={() => p.dispatchProp({ type: "toggle", id: prop.id, key: "tour" })}
                >
                  <b>360° virtual tour</b>
                  <small>
                    {tourLocked
                      ? `Not in ${tier?.label ?? "this tier"}`
                      : price && prices.tour != null
                        ? `Priced by size · ${m(prices.tour)} for ${prop.type === "commercial" ? (tier?.label ?? "this tier") : "the current size"}`
                        : "Priced by property size"}
                  </small>
                </button>
              </div>
            </div>
            {prop.twilight && (
              <div className="pt-bk-seg" role="group" aria-label="Twilight images">
                {TWILIGHT_QTYS.map((q) => (
                  <button
                    key={q}
                    type="button"
                    aria-pressed={prop.twilightQty === q}
                    onClick={() => update({ twilightQty: q })}
                  >
                    {q} images{price ? ` · ${m(twi[q])}` : ""}
                  </button>
                ))}
                <p className="pt-meta">{twilightNote(prop, cfg.pricing)}</p>
              </div>
            )}
          </div>
        )}
      </section>

      {videoCard("short")}
      {videoCard("long")}
      {p.error && (
        <span className="pt-field-msg" role="alert">
          {p.error}
        </span>
      )}
    </div>
  );
}

/* ---------- 2. Property ---------- */

export function PropertyStep({
  cfg,
  prop,
  dispatchProp,
}: {
  cfg: RequestConfig;
  prop: BookingProperty;
  dispatchProp: Dispatch<Action>;
}) {
  const { pricing } = cfg;
  const price = !!cfg.price.rates;
  const m = (n: number) => money(cfg.price.currency, n);
  const update = (patch: Partial<BookingProperty>) =>
    dispatchProp({ type: "update", id: prop.id, patch });
  const types = ["apartment", "villa", "commercial"] as const;
  const photoAt = (size: number) => servicePrices({ ...prop, size }, pricing).photo;
  return (
    <div className="pt-bk-step" data-testid="step-property">
      <h2 className="pt-h2">Property type</h2>
      <div className="pt-bk-types" role="group" aria-label="Property type">
        {types.map((t) => (
          <button
            key={t}
            type="button"
            aria-pressed={prop.type === t}
            onClick={() => dispatchProp({ type: "setType", id: prop.id, value: t })}
          >
            <Glyph name={t} />
            <b>{pricing[t].label}</b>
          </button>
        ))}
      </div>

      <h2 className="pt-h2">{prop.type === "commercial" ? "Property scale" : "Size"}</h2>
      {prop.type === "commercial" ? (
        <div className="pt-bk-tiers" role="group" aria-label="Property scale">
          {pricing.commercial.tiers.map((t, i) => (
            <button
              key={t.label}
              type="button"
              aria-pressed={prop.size === i}
              onClick={() => update({ size: i })}
            >
              {t.popular && <span className="pt-badge gold">Most popular</span>}
              <b>{t.label}</b>
              <small>{t.description}</small>
              {price && <small className="pt-mono">{m(photoAt(i))}</small>}
            </button>
          ))}
        </div>
      ) : (
        <div className="pt-bk-sizes" role="group" aria-label="Size">
          {pricing[prop.type].sizes.map((s, i) => (
            <button
              key={s.label}
              type="button"
              aria-pressed={prop.size === i}
              onClick={() => update({ size: i })}
            >
              <b>{s.label}</b>
              {price && <small className="pt-mono">{m(photoAt(i))}</small>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------- 3. Schedule ---------- */

export function ScheduleStep({
  today,
  date,
  setDate,
  slot,
  chooseSlot,
  startTime,
  setStartTime,
}: {
  today: string;
  date: string;
  setDate: (v: string) => void;
  slot: Slot | "";
  chooseSlot: (s: Slot) => void;
  startTime: string;
  setStartTime: (v: string) => void;
}) {
  const times = arrivalTimes(slot);
  // An older booking's quarter-hour time still shows as a chip, so nothing is hidden.
  const shown = startTime && !times.includes(startTime) ? [startTime, ...times] : times;
  const GLYPH: Record<Slot, keyof typeof ICONS> = {
    morning: "morning",
    afternoon: "afternoon",
    full_day: "fullday",
  };
  return (
    <div className="pt-bk-step pt-bk-when" data-testid="step-schedule">
      <div>
        <h2 className="pt-h2">Date</h2>
        <DateCalendar value={date} min={today} onChange={setDate} />
      </div>
      <div className="pt-bk-when-r">
        <div data-field="slot">
          <h2 className="pt-h2">Preferred slot</h2>
          <p className="pt-meta pt-bk-lede">
            The window you’d like us to arrive in. We confirm the exact time.
          </p>
          <div className="pt-bk-slots" role="group" aria-label="Slot">
            {SLOTS.map(([k, label]) => {
              const [a, b] = SLOT_HOURS[k];
              return (
                <button
                  key={k}
                  type="button"
                  aria-pressed={slot === k}
                  onClick={() => chooseSlot(k)}
                >
                  <Glyph name={GLYPH[k]} />
                  <b>{label}</b>
                  <small>
                    {timeLabel(a)} – {timeLabel(b)}
                  </small>
                </button>
              );
            })}
          </div>
        </div>
        <div data-field="start_time">
          <h2 className="pt-h2">Arrival time</h2>
          <p className="pt-meta pt-bk-lede">
            {slot ? "Optional. Pick the hour you’d prefer." : "Choose a slot first."}
          </p>
          <div className="pt-bk-times" role="group" aria-label="Preferred arrival time">
            {slot &&
              shown.map((t) => (
                <button
                  key={t}
                  type="button"
                  aria-pressed={startTime === t}
                  onClick={() => setStartTime(startTime === t ? "" : t)}
                >
                  {timeLabel(t)}
                </button>
              ))}
          </div>
        </div>
      </div>
    </div>
  );
}
