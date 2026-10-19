"use client";

import Link from "next/link";
import { useEffect, useReducer, useRef, useState, useTransition } from "react";
import {
  blankProperty,
  isLocked,
  reducer,
  servicePrices,
  title as propertyTitle,
  TWILIGHT_QTYS,
  twilightTable,
  type Action,
  type BookingProperty,
} from "@/lib/booking";
import { bookShoot, updateBooking } from "@/lib/portal/book-actions";
import { dateLabel } from "@/lib/portal/billing";
import {
  cleanVideos,
  DAY_LABEL,
  estimateLines,
  KEY,
  normalizeServices,
  photosOnly,
  slotHours,
  SLOTS,
  type BookingLocation,
  type BookingService,
  type PropertyConfig,
  type Slot,
  type VideoPlan,
} from "@/lib/portal/booking";
import type { RequestConfig } from "@/lib/portal/requests";
import { BookingPanel, lineName, PriceTag, priceView, type PanelLine } from "./bookPrice";
import { BookStep, Check, Counter, Seg, ServiceCard, ThankYou } from "./BookFrame";
import { DraftOffer, Field, FormBanner, useDraft, useFormCheck, useLeaveGuard } from "./forms";
import { DatePicker, TimeWheel } from "./Pickers";
import { PlacesField } from "./PlacesField";

/** What's being booked: a property shoot (always shot & edited) or a content shoot. */
export type ShootKind = "property" | "content";
export type StepId = "services" | "when" | "review";
export const STEPS: StepId[] = ["services", "when", "review"];

/**
 * Change a Requested shoot, or ask to change a Confirmed one (owner, 10 Oct 2026): the booking
 * as it is, read in today's shape.
 */
export type BookingEdit = {
  projectId: string;
  ref: string;
  status: "requested" | "confirmed";
  date: string;
  slot: Slot | "";
  startTime?: string;
  location: BookingLocation;
  services: BookingService[];
  note: string;
};

const toConfig = (p: BookingProperty): PropertyConfig => ({
  type: p.type,
  size: p.size,
  photo: p.photo,
  twilight: p.twilight,
  twilightQty: p.twilightQty,
  video: p.video,
  short: p.short,
  long: p.long,
  lighting: p.lighting,
  tour: p.tour,
});

/** Delivery texts on the choices (presentation; the admin's turnaround texts are listed for the
 *  owner separately). */
const DELIVERY = {
  photo: "Delivered same day",
  tour: "Delivered in 48–72 hours",
  short: "Within 48 hours",
  long: "48–72 hours",
};
/** A content shoot's brief and reference links, saved at the start of the booking's notes
 *  (owner, 19 Oct 2026). */
const BRIEF = "Brief: ";
const REFS = "References:\n";
function splitNote(n: string): { brief: string; refs: string; note: string } {
  if (!n.startsWith(BRIEF) && !n.startsWith(REFS)) return { brief: "", refs: "", note: n };
  const parts = n.split("\n\n");
  let brief = "";
  let refs = "";
  const rest: string[] = [];
  for (const p of parts) {
    if (!brief && !refs && !rest.length && p.startsWith(BRIEF)) brief = p.slice(BRIEF.length);
    else if (!refs && !rest.length && p.startsWith(REFS)) refs = p.slice(REFS.length);
    else rest.push(p);
  }
  return { brief, refs, note: rest.join("\n\n") };
}
/** The wheel's window: 08:00 to 17:45, every slot's start times together. */
const [WHEEL_FROM, WHEEL_TO] = slotHours("");

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** "1 Bed apartment · Photos · Twilight ×10 · 360° tour". */
function propertyText(p: BookingProperty, pricing: RequestConfig["pricing"]) {
  return [
    propertyTitle(p, pricing),
    p.photo ? "Photos" : "",
    p.photo && p.twilight ? `Twilight ×${p.twilightQty}` : "",
    p.tour ? "360° tour" : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

/** "4 reels · 1 long-form", "Flexible · Short-form · final total after the shoot". */
function videoText(v: VideoPlan) {
  if (v.by === "time")
    return v.raw
      ? [DAY_LABEL[v.day === "full" ? "full" : "half"], "raw files", v.approx ?? ""]
          .filter(Boolean)
          .join(" · ")
      : ["Edited, flexible", v.approx ?? "", "final total after the shoot"]
          .filter(Boolean)
          .join(" · ");
  return [
    v.short ? plural(v.short, "reel") : "",
    v.long ? `${v.long} long-form${v.extra_min ? ` +${v.extra_min} min` : ""}` : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

type Formats = { short: boolean; long: boolean };
type Counts = { short: number; long: number; extra_min?: number };
type Snap = {
  kind?: ShootKind;
  /** Numbered steps (and "property"): drafts from before. */
  step: StepId | "property" | 1 | 2 | 3;
  prop: PropertyConfig | null;
  pv?: Counts;
  brief?: string;
  refs?: string;
  fmt?: Formats;
  edited?: boolean;
  flex?: boolean;
  cv?: Counts;
  day?: "half" | "full";
  startTime?: string;
  date: string;
  slot: Slot | "";
  loc: BookingLocation;
  note: string;
};
const OLD_STEP: Record<string, StepId> = {
  1: "services",
  2: "when",
  3: "review",
  property: "services",
};

/** Short-form / long-form, kept in the rough-count text by the day (owner, 18 Oct 2026). */
const fmtText = (f: Formats) =>
  [f.short ? "Short-form" : "", f.long ? "Long-form" : ""].filter(Boolean).join(" + ");
const fmtFrom = (t: string | undefined): Formats => {
  const short = /short|reel/i.test(t ?? "");
  const long = /long|walkthrough|youtube/i.test(t ?? "");
  return short || long ? { short, long } : { short: true, long: false };
};

/**
 * Book a shoot on the Book media page (owner, 10 Oct 2026; page, 18 Oct 2026). Property shoot:
 * type and size, then Photography (+ Twilight images), a 360° virtual tour and Video (short-form
 * and long-form counters; not for commercial), any combination. Content shoot: Edited (a fixed
 * count, or flexible: the half-day minimum) or Raw files (half or full day, chosen on When &
 * where), short-form and/or long-form, and a brief.
 * Then When & where and the Summary; Confirm makes a Requested shoot, Milkywayy is emailed and
 * confirms it. Autosaves as a draft.
 */
export function BookingFlow({
  cfg,
  kind,
  onKind,
  lockKind,
  step,
  onStep,
  resume,
  edit,
  onBack,
  onAnother,
}: {
  cfg: RequestConfig;
  kind: ShootKind;
  /** A restored draft of the other kind switches to it (unless the kind was just chosen). */
  onKind?: (k: ShootKind) => void;
  lockKind?: boolean;
  step: StepId;
  /** Go to a step (the page keeps it in the URL, so the browser's back button works). */
  onStep: (s: StepId, replace?: boolean) => void;
  resume?: boolean;
  edit?: BookingEdit;
  /** Back from the first step: "What are you booking?". */
  onBack?: () => void;
  /** The thank-you's "Book another". */
  onAnother?: () => void;
}) {
  const { pricing } = cfg;
  // An older booking is read in today's shape (lib/portal/booking normalizeServices).
  const s0 = normalizeServices(edit?.services ?? []);
  const v0 = s0.find((x) => x.service === "videos")?.videos;
  const p0 = s0.find((x) => x.service === "property" && x.property)?.property;
  // A booking by time on a property shoot (older bookings only) keeps its plan unchanged.
  const keepPlan = p0 && v0?.by === "time" ? v0 : null;
  const [pv, setPv] = useState<Counts>({
    short: p0 && v0?.by === "count" ? (v0.short ?? 0) : 0,
    long: p0 && v0?.by === "count" ? (v0.long ?? 0) : 0,
    extra_min: p0 ? v0?.extra_min : undefined,
  });
  const n0 = splitNote(edit?.note ?? "");
  const [brief, setBrief] = useState(n0.brief);
  const [refs, setRefs] = useState(n0.refs);
  const [fmt, setFmt] = useState<Formats>(() =>
    !v0 || p0
      ? { short: false, long: false }
      : v0.by === "time"
        ? fmtFrom(v0.approx)
        : { short: !!v0.short, long: !!v0.long },
  );
  const [edited, setEdited] = useState(!(v0?.by === "time" && v0.raw && !p0));
  const [flex, setFlex] = useState(!p0 && v0?.by === "time" && !v0.raw);
  const [cv, setCv] = useState<Counts>({
    short: !p0 && v0?.by === "count" && v0.short ? v0.short : 4,
    long: !p0 && v0?.by === "count" && v0.long ? v0.long : 1,
    extra_min: !p0 ? v0?.extra_min : undefined,
  });
  const [day, setDay] = useState<"half" | "full">(v0?.day === "full" ? "full" : "half");
  const [date, setDate] = useState(edit?.date ?? "");
  const [startTime, setStartTime] = useState(edit?.startTime ?? "");
  const [loc, setLoc] = useState<BookingLocation>(edit?.location ?? { address: "" });
  const [note, setNote] = useState(n0.note);
  // Flexible edited is always the half-day minimum (owner, 19 Oct 2026); an older full-day
  // flexible booking keeps its day when edited.
  const flexDay: "half" | "full" =
    v0?.by === "time" && !v0.raw && !p0 ? (v0.day ?? "half") : "half";
  const [agent, setAgent] = useState(cfg.myContactId ?? "");
  const [touched, setTouched] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [prop, dispatchProp] = useReducer(
    (p: BookingProperty, a: Action) =>
      reducer(pricing)({ properties: [p], nextId: 2 }, a).properties[0],
    blankProperty(1, pricing, "", ""),
    (p) => (p0 ? { ...p, ...p0 } : p),
  );
  const touch =
    <A extends unknown[]>(f: (...a: A) => void) =>
    (...a: A) => {
      setTouched(true);
      f(...a);
    };
  const propAct = touch((a: Action) => dispatchProp(a));

  const isProp = kind === "property";
  const propOk = prop.photo || prop.tour;
  const pVideo = pv.short > 0 || pv.long > 0;
  const anyFmt = fmt.short || fmt.long;
  const counted = (c: Counts, f?: Formats): VideoPlan =>
    cleanVideos({
      by: "count",
      short: !f || f.short ? c.short : 0,
      long: !f || f.long ? c.long : 0,
      extra_min: c.extra_min,
    });
  const plan: VideoPlan | null = isProp
    ? (keepPlan ?? (pVideo ? counted(pv) : null))
    : !anyFmt
      ? null
      : !edited
        ? cleanVideos({ by: "time", raw: true, day, approx: fmtText(fmt) })
        : flex
          ? cleanVideos({ by: "time", day: flexDay, approx: fmtText(fmt) })
          : counted(cv, fmt);
  const services: BookingService[] = [
    ...(isProp && propOk
      ? [{ service: "property" as const, property: photosOnly(toConfig(prop)) }]
      : []),
    ...(plan && (plan.by === "time" || plan.short || plan.long)
      ? [{ service: "videos" as const, videos: plan }]
      : []),
  ];
  // No slot picker (owner, 18 Oct 2026): the slot follows the start time; a full day is Full day.
  const slot: Slot | "" =
    plan?.by === "time" && plan.day === "full"
      ? "full_day"
      : !startTime
        ? ""
        : startTime < slotHours("afternoon")[0]
          ? "morning"
          : "afternoon";
  const at = STEPS.indexOf(step);
  const refList = refs
    .split("\n")
    .map((r) => r.trim())
    .filter(Boolean);
  const savedNote = isProp
    ? note
    : [
        brief.trim() && `${BRIEF}${brief.trim()}`,
        refList.length && `${REFS}${refList.join("\n")}`,
        note.trim(),
      ]
        .filter(Boolean)
        .join("\n\n");

  const snap: Snap = {
    kind,
    step,
    prop: toConfig(prop),
    pv,
    brief,
    refs,
    fmt,
    edited,
    flex,
    cv,
    day,
    startTime,
    date,
    slot,
    loc,
    note,
  };
  // useDraft keeps it in a ref: no memoization needed.
  const restore = (d: Snap) => {
    if (d.kind && d.kind !== kind) {
      if (resume && lockKind) return;
      onKind?.(d.kind);
    }
    const st = typeof d.step === "number" || d.step === "property" ? OLD_STEP[d.step] : d.step;
    // Drafts open at their step.
    onStep(st ?? "services", true);
    if (d.prop) dispatchProp({ type: "update", id: 1, patch: { ...d.prop } });
    if (d.pv) setPv(d.pv);
    setBrief(d.brief ?? "");
    setRefs(d.refs ?? "");
    if (d.fmt) setFmt(d.fmt);
    if (d.edited != null) setEdited(d.edited);
    if (d.flex != null) setFlex(d.flex);
    if (d.cv) setCv(d.cv);
    if (d.day) setDay(d.day);
    setStartTime(d.startTime ?? "");
    setDate(d.date ?? "");
    setLoc(d.loc ?? { address: "" });
    setNote(d.note ?? "");
    setTouched(true);
  };
  const draft = useDraft("booking", snap as unknown as Record<string, unknown>, {
    touched: touched && !done,
    resume,
    onRestore: restore as unknown as (d: Record<string, unknown>) => void,
    enabled: !edit,
  });
  const leave = useLeaveGuard({
    dirty: touched && !done && !edit,
    saveNow: draft.saveNow,
    discard: draft.discard,
  });
  // Leaving for "What are you booking?" with the browser's back button: keep the draft.
  const saveRef = useRef<() => void>(() => {});
  useEffect(() => {
    saveRef.current = () => {
      if (touched && !done && !edit) void draft.saveNow();
    };
  });
  useEffect(() => () => saveRef.current(), []);

  const form = useFormCheck(() =>
    step === "services"
      ? isProp
        ? { property: !propOk && "Choose photography, a 360° tour or both." }
        : { kind: !anyFmt && "Choose short-form, long-form or both." }
      : step === "when"
        ? {
            date: (!date && "Choose a date.") || (date < cfg.today && "Choose a date from today."),
            start_time:
              (!startTime && "Choose a start time.") ||
              ((startTime < WHEEL_FROM || startTime > WHEEL_TO) && "Choose a time from 8:00."),
            location: loc.address.trim().length < 3 && "Add the location.",
          }
        : {},
  );

  // Always worked out (labels for the summary); amounts are shown only with price access.
  const lines = estimateLines(services, cfg.price.rates ?? {}, pricing);
  const v = priceView(cfg, lines);
  const { m } = v;
  const pText = propertyText(prop, pricing);
  const fText = fmtText(fmt);
  const sub: Record<string, string> = {
    [KEY.photos]: pText,
    [KEY.raw.half]: fText,
    [KEY.raw.full]: fText,
    [KEY.min.half]: `${fText} · final total after the shoot`,
    [KEY.min.full]: `${fText} · final total after the shoot`,
  };
  const panelLines: PanelLine[] = lines.map((l) => ({
    key: l.key,
    label: lineName(l.key, l.qty, l.label),
    sub: l.key ? sub[l.key] : undefined,
  }));
  const shown = (key: string) => v.items.find((s) => s.key === key);
  const rates = cfg.price.rates;
  const rate = (key: string) => (rates?.[key] == null ? null : Number(rates[key]));
  const leftOf = (key: string) =>
    cfg.price.mode === "package" ? Number(cfg.price.left?.[key]?.remaining ?? 0) : 0;
  /** An unchosen video's price: "Included in your package" while some is left, else its rate. */
  const offPrice = (key: string) =>
    leftOf(key) > 0 ? (
      <span className="bkp-muted">Included in your package</span>
    ) : v.rates && rate(key) != null ? (
      <span className="bkp-price">{m(rate(key)!)}</span>
    ) : null;

  function next() {
    if (!form.check()) return;
    form.reset();
    onStep(STEPS[Math.min(at + 1, STEPS.length - 1)]);
  }
  function back() {
    form.reset();
    if (at > 0) return onStep(STEPS[at - 1]);
    if (touched && !edit) void draft.saveNow();
    onBack?.();
  }
  function confirm() {
    if (!services.length || !slot) return;
    const b = {
      date,
      slot,
      startTime: startTime || undefined,
      location: loc,
      services,
      note: savedNote,
    };
    start(async () => {
      const r = edit ? await updateBooking(edit.projectId, b) : await bookShoot({ ...b, agent });
      if (!r.ok) return form.fail(r.error ?? "Couldn’t send the booking. Try again.");
      setDone(edit ? edit.ref : r.ref!);
      window.scrollTo({ top: 0 });
    });
  }

  if (done)
    return (
      <ThankYou
        idLabel="Booking ID"
        id={done}
        heading={
          edit?.status === "confirmed"
            ? "Change requested"
            : edit
              ? "Details saved"
              : "Thanks, your booking request is in"
        }
        text={
          edit?.status === "confirmed"
            ? "We’ll look at the change and confirm the shoot again by email."
            : "We’ll confirm your slot by email."
        }
      >
        <Link href={`/portal/shoots/${encodeURIComponent(done)}`} className="btn btn-p btn-s">
          Track booking
        </Link>
        {onAnother && !edit && (
          <button type="button" className="btn btn-g btn-s" onClick={onAnother}>
            Book another
          </button>
        )}
      </ThankYou>
    );

  /* ---------- step 1: property shoot ---------- */
  const prices = servicePrices(prop, pricing);
  // Commercial uses its own tiers (Basic, Essential, …) from the portal's price list.
  const sizes =
    prop.type === "commercial"
      ? pricing.commercial.tiers.map((t) => t.label)
      : pricing[prop.type].sizes.map((z) => z.label);
  const commercial = prop.type === "commercial";
  const tourLocked = isLocked(prop, "tour", pricing);
  const twi = twilightTable(prop, pricing);
  const setP = touch((patch: Partial<Counts>) => setPv((x) => ({ ...x, ...patch })));
  const photoSub = prices.photo + (prop.twilight ? twi[prop.twilightQty] : 0);
  const videoItems = v.items.filter((s) => s.key === KEY.short || s.key === KEY.long);
  const videoSum = videoItems.reduce((n, s) => n + (s.amount ?? 0), 0);
  const videoSubtotal =
    !v.rates || !videoItems.length ? null : v.pkg && !videoSum ? (
      <span className="bkp-muted">Included in your package</span>
    ) : (
      <span className="bkp-price">{m(videoSum)}</span>
    );
  const plain = (n: number | null | undefined, plus = false) =>
    v.rates && n != null ? <span className="bkp-price">{`${plus ? "+" : ""}${m(n)}`}</span> : null;

  const propertyStep = (
    <>
      <div className="bkp-group">
        <span className="bkp-muted">Property type</span>
        <Seg
          label="Property type"
          value={prop.type}
          options={(["apartment", "villa", "commercial"] as const).map((t) => [
            t,
            t === "villa" ? "Villa" : pricing[t].label,
          ])}
          onChange={(t) => {
            propAct({ type: "setType", id: 1, value: t });
            // Commercial is photos and the 360° tour only.
            if (t === "commercial") setPv({ short: 0, long: 0 });
          }}
        />
      </div>
      <div className="bkp-group">
        <span className="bkp-muted">{prop.type === "commercial" ? "Scale" : "Size"}</span>
        <div className="bkp-chips" role="group" aria-label="Size" data-testid="photo-price">
          {sizes.map((z, i) => (
            <button
              key={z}
              type="button"
              aria-pressed={prop.size === i}
              onClick={() => propAct({ type: "update", id: 1, patch: { size: i } })}
            >
              <span>{z}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="bkp-groups" data-field="property">
        <div className="bkp-box-card" data-on={prop.photo ? "" : undefined}>
          <Check
            label="Photography"
            sub={DELIVERY.photo}
            checked={prop.photo}
            right={plain(prices.photo)}
            onChange={() => propAct({ type: "toggle", id: 1, key: "photo" })}
          />
          {prop.photo && (
            <div className="bkp-nested">
              <Check
                label="Twilight images"
                sub="Edited from your daylight photos, no night shoot needed"
                checked={prop.twilight}
                right={plain(twi[prop.twilightQty], true)}
                onChange={() => propAct({ type: "toggle", id: 1, key: "twilight" })}
              />
              {prop.twilight && (
                <div className="bkp-chips bkp-chips-3" role="group" aria-label="Twilight images">
                  {TWILIGHT_QTYS.map((q) => (
                    <button
                      key={q}
                      type="button"
                      aria-pressed={prop.twilightQty === q}
                      onClick={() => propAct({ type: "update", id: 1, patch: { twilightQty: q } })}
                    >
                      <span>{q} images</span>
                      {v.rates && <span className="bkp-muted">{m(twi[q])}</span>}
                    </button>
                  ))}
                </div>
              )}
              {prop.twilight && v.rates && (
                <div className="bkp-row bkp-subtotal">
                  <span className="bkp-muted">Photography total</span>
                  <span className="bkp-price">{m(photoSub)}</span>
                </div>
              )}
            </div>
          )}
        </div>
        <div className="bkp-box-card" data-on={prop.tour ? "" : undefined}>
          <Check
            label="360° virtual tour"
            sub={tourLocked ? "Not available for this scale" : DELIVERY.tour}
            checked={prop.tour}
            disabled={tourLocked}
            right={tourLocked ? null : plain(prices.tour)}
            onChange={() => propAct({ type: "toggle", id: 1, key: "tour" })}
          />
        </div>
        {!commercial && (
          <div className="bkp-box-card" data-on={pVideo ? "" : undefined}>
            <div className="bkp-row">
              <span className="bkp-body">Video</span>
              {videoSubtotal}
            </div>
            <div className="bkp-row">
              <Check
                label="Short-form reel"
                sub={`30–90 sec · ${DELIVERY.short.toLowerCase()}`}
                checked={pv.short > 0}
                right={pv.short > 0 ? <PriceTag s={shown(KEY.short)} v={v} /> : offPrice(KEY.short)}
                onChange={() => setP({ short: pv.short > 0 ? 0 : 1 })}
              />
              {pv.short > 0 && !keepPlan && (
                <Counter
                  label="Short-form reels"
                  value={pv.short}
                  onChange={(n) => setP({ short: n })}
                />
              )}
            </div>
            <div className="bkp-row">
              <Check
                label="Long-form walkthrough"
                sub={`Up to 5 min · ${DELIVERY.long} · extra minutes billed after delivery`}
                checked={pv.long > 0}
                right={pv.long > 0 ? <PriceTag s={shown(KEY.long)} v={v} /> : offPrice(KEY.long)}
                onChange={() => setP(pv.long > 0 ? { long: 0, extra_min: 0 } : { long: 1 })}
              />
              {pv.long > 0 && !keepPlan && (
                <Counter label="Long-form" value={pv.long} onChange={(n) => setP({ long: n })} />
              )}
            </div>
          </div>
        )}
        {form.errors.property && (
          <span className="pt-field-msg" role="alert">
            {form.errors.property}
          </span>
        )}
      </div>
    </>
  );

  /* ---------- step 1: content shoot ---------- */
  const setC = touch((patch: Partial<Counts>) => setCv((x) => ({ ...x, ...patch })));
  const fixed = edited && !flex;
  const CARD = {
    short: {
      title: "Short-form",
      line: "Reels, 30–90 sec",
      key: KEY.short,
      delivery: DELIVERY.short,
    },
    long: {
      title: "Long-form",
      line: "YouTube, up to 5 min",
      key: KEY.long,
      delivery: DELIVERY.long,
    },
  } as const;
  /** "AED 400 each", or "Included in your package" while some is left. */
  const each = (key: string) =>
    leftOf(key) > 0 ? (
      <span className="bkp-muted">Included in your package</span>
    ) : v.rates && rate(key) != null ? (
      <span className="bkp-price">{`${m(rate(key)!)} each`}</span>
    ) : null;
  const contentStep = (
    <>
      <div className="bkp-group">
        <span className="bkp-muted">Editing</span>
        <Seg
          label="Editing"
          value={edited ? "edited" : "raw"}
          options={[
            ["edited", "Edited"],
            ["raw", "Raw files"],
          ]}
          onChange={touch((x: string) => setEdited(x === "edited"))}
        />
      </div>
      {edited && (
        <div className="bkp-group">
          <span className="bkp-muted">Quantity</span>
          <Seg
            label="Quantity"
            value={flex ? "flex" : "fixed"}
            options={[
              ["fixed", "Fixed"],
              ["flex", "Flexible"],
            ]}
            onChange={touch((x: string) => setFlex(x === "flex"))}
          />
        </div>
      )}
      <div className="bkp-cards bkp-cards-2" data-field="kind">
        {(["short", "long"] as const).map((k) => (
          <ServiceCard
            key={k}
            title={CARD[k].title}
            line={CARD[k].line}
            meta={edited ? CARD[k].delivery : null}
            price={
              !edited ? null : fixed && fmt[k] ? (
                <PriceTag s={shown(CARD[k].key)} v={v} />
              ) : (
                each(CARD[k].key)
              )
            }
            on={fmt[k]}
            onToggle={touch(() => setFmt((f) => ({ ...f, [k]: !f[k] })))}
          >
            {fmt[k] && fixed ? (
              <Counter
                label={k === "short" ? "Reels" : "Long-form"}
                value={cv[k]}
                onChange={(n) => setC({ [k]: n })}
              />
            ) : undefined}
          </ServiceCard>
        ))}
        {form.errors.kind && (
          <span className="pt-field-msg bkp-wide" role="alert">
            {form.errors.kind}
          </span>
        )}
      </div>
      {edited && flex && (
        <p className="bkp-body" data-testid="day-note">
          {!v.rates
            ? "Billed per finished video · final total after the shoot"
            : cfg.price.mode === "package"
              ? "Each finished video draws from your package · final total after the shoot"
              : [
                  rate(KEY.min[flexDay]) != null && `from ${m(rate(KEY.min[flexDay])!)}`,
                  "final total after the shoot",
                ]
                  .filter(Boolean)
                  .join(" · ")}
        </p>
      )}
      <label className="pt-field">
        What do you need?
        <textarea
          rows={3}
          maxLength={1500}
          value={brief}
          placeholder="Topic, style, who's on camera, where it will be posted"
          onChange={touch((e: React.ChangeEvent<HTMLTextAreaElement>) => setBrief(e.target.value))}
        />
      </label>
      <label className="pt-field">
        Reference links (optional, one per line)
        <textarea
          rows={2}
          maxLength={1000}
          value={refs}
          placeholder="https://"
          onChange={touch((e: React.ChangeEvent<HTMLTextAreaElement>) => setRefs(e.target.value))}
        />
      </label>
    </>
  );

  /* ---------- step 2: when & where ---------- */
  const rawLen = !isProp && !edited;
  const whenStep = (
    <>
      <div className={`bkp-when ${rawLen ? "bkp-3col" : "bkp-2col"}`}>
        <Field name="date" label="Date" required group error={form.errors.date}>
          <DatePicker
            value={date}
            min={cfg.today}
            invalid={!!form.errors.date}
            onChange={touch((x: string) => setDate(x))}
          />
        </Field>
        <Field name="start_time" label="Start time" required group error={form.errors.start_time}>
          <TimeWheel
            value={startTime}
            from={WHEEL_FROM}
            to={WHEEL_TO}
            placeholder="Choose a time"
            clearable={false}
            invalid={!!form.errors.start_time}
            onChange={touch((x: string) => setStartTime(x))}
          />
        </Field>
        {rawLen && (
          <Field name="day" label="Length" group>
            <Seg
              label="Length"
              value={day}
              options={(["half", "full"] as const).map((d) => [
                d,
                <span key={d} className="bkp-seg-2">
                  {DAY_LABEL[d]}
                  {v.rates && rate(KEY.raw[d]) != null && (
                    <span className="bkp-muted">{m(rate(KEY.raw[d])!)}</span>
                  )}
                </span>,
              ])}
              onChange={touch((d: "half" | "full") => setDay(d))}
            />
          </Field>
        )}
      </div>
      <PlacesField
        value={loc}
        onChange={touch((x: BookingLocation) => setLoc(x))}
        error={form.errors.location}
      />
      <label className="pt-field">
        Notes
        <textarea
          rows={3}
          maxLength={2000}
          value={note}
          placeholder="Style, people on camera, rooms to focus on"
          onChange={touch((e: React.ChangeEvent<HTMLTextAreaElement>) => setNote(e.target.value))}
        />
      </label>
    </>
  );

  /* ---------- step 3: summary ---------- */
  const slotLabel = SLOTS.find(([k]) => k === slot)?.[1] ?? "";
  const groups: { key: string; label: string; to: StepId; rows: string[] }[] = [
    ...(isProp && propOk
      ? [{ key: "property", label: "Property", to: "services" as const, rows: [pText] }]
      : []),
    ...(plan && services.some((x) => x.service === "videos")
      ? [
          {
            key: "video",
            label: "Video",
            to: "services" as const,
            rows: [
              videoText(plan),
              !isProp && brief.trim() ? `Brief: ${brief.trim()}` : "",
              !isProp && refList.length ? `References: ${refList.join(", ")}` : "",
            ].filter(Boolean),
          },
        ]
      : []),
    {
      key: "when",
      label: "Date & time",
      to: "when",
      rows: [
        [dateLabel(date, { weekday: "short" }), startTime, slotLabel].filter(Boolean).join(" · "),
      ],
    },
    {
      key: "where",
      label: "Location",
      to: "when",
      rows: [
        [loc.address, loc.unit].filter(Boolean).join(" · "),
        loc.access ? `Access: ${loc.access}` : "",
        note.trim() ? `Notes: ${note.trim()}` : "",
      ].filter(Boolean),
    },
  ];
  const reviewStep = (
    <>
      <dl className="bkp-review" aria-label="Summary">
        {groups.map((g) => (
          <div key={g.key}>
            <dt>{g.label}</dt>
            <dd>
              {g.rows.map((r, i) => (
                <span key={i}>{r}</span>
              ))}
            </dd>
            <button type="button" className="bkp-link" onClick={() => onStep(g.to)}>
              Edit
            </button>
          </div>
        ))}
        {!edit && cfg.agents.length > 0 && (
          <div>
            <dt>
              <label htmlFor="bk-agent">Agent</label>
            </dt>
            <dd>
              <select
                id="bk-agent"
                name="agent"
                value={agent}
                onChange={touch((e: React.ChangeEvent<HTMLSelectElement>) =>
                  setAgent(e.target.value),
                )}
              >
                <option value="">No agent</option>
                {cfg.agents.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </dd>
          </div>
        )}
      </dl>
      {/* Phones: the side panel isn't shown, so the prices go here. */}
      <div className="bkp-box-card bkp-phone-only">
        <BookingPanel lines={panelLines} v={v} />
      </div>
    </>
  );

  const confirmLabel = pending
    ? "Sending…"
    : edit?.status === "confirmed"
      ? "Send change request"
      : edit
        ? "Save changes"
        : v.pkg && v.due != null
          ? `Confirm booking · ${m(v.due)}`
          : v.total
            ? `Confirm booking · ${v.total.value}`
            : "Confirm booking";
  const barText =
    v.pkg && v.due != null
      ? m(v.due)
      : (v.total?.value ?? (lines.length ? plural(lines.length, "item") : "Nothing yet"));

  return (
    <>
      <BookStep
        label={`Step ${at + 1} of ${STEPS.length}`}
        heading={
          step === "services"
            ? isProp
              ? "Property shoot"
              : "Content shoot"
            : step === "when"
              ? "When & where"
              : "Summary"
        }
        onBack={at > 0 || onBack ? back : undefined}
        primary={
          step === "review"
            ? { label: confirmLabel, onClick: confirm, disabled: pending || !services.length }
            : { label: "Next", onClick: next }
        }
        panel={<BookingPanel lines={panelLines} v={v} />}
        barText={barText}
      >
        <DraftOffer
          offer={draft.offer}
          onContinue={draft.continueOffer}
          onFresh={draft.startFresh}
        />
        <FormBanner text={form.banner} />
        {step === "services" && (isProp ? propertyStep : contentStep)}
        {step === "when" && whenStep}
        {step === "review" && reviewStep}
      </BookStep>
      {leave}
    </>
  );
}
