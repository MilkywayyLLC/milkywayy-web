"use client";

import { whenLabel } from "@/lib/portal/when";
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
  CONTENT_HOURS,
  CONTENT_KEY,
  CONTENT_LONG_MAX_V2,
  DAY_LABEL,
  estimate,
  hoursNeeded,
  isContentHours,
  isLongLength,
  estimateLines,
  KEY,
  LONG_FORM_MINUTES,
  LONG_LENGTHS,
  longKey,
  longPrice,
  normalizeServices,
  photosOnly,
  slotHours,
  type BookingLocation,
  type BookingService,
  type ContentHours,
  type PropertyConfig,
  type Slot,
  type VideoPlan,
} from "@/lib/portal/booking";
import type { RequestConfig } from "@/lib/portal/requests";
import { halfDaysOf } from "@/lib/portal/payments";
import {
  BookingPanel,
  lineName,
  PriceTag,
  priceView,
  type PanelLine,
  type PriceView,
} from "./bookPrice";
import { confirmText, DueLine, DueNow, PanelTerms, TermsCheck } from "./BookingTerms";
import { BookStep, Check, Counter, Seg, ServiceCard, ThankYou } from "./BookFrame";
import {
  ChoiceDialog,
  DraftOffer,
  Field,
  FormBanner,
  useDraft,
  useFormCheck,
  useLeaveGuard,
} from "./forms";
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
  /** The total it was booked at (frozen prices); kept unless the services change. */
  estimate?: number | null;
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
/** The wheel's window (owner, 25 Oct 2026): working hours 08 to 18, quarter hours. */
const [WHEEL_FROM, WHEEL_TO] = ["08:00", "18:45"];

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
  if (v.by === "hours")
    return [
      `${v.hours} h shoot`,
      v.raw
        ? "raw files only"
        : [
            v.short ? plural(v.short, "short-form edit") : "",
            v.long
              ? `${plural(v.long, "long-form edit")}${v.longs?.length ? ` (${v.longs.join(", ")} min)` : ""}`
              : "",
          ]
            .filter(Boolean)
            .join(" · ") || "no edits",
    ].join(" · ");
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

type Counts = { short: number; long: number; extra_min?: number };
type Snap = {
  kind?: ShootKind;
  /** Numbered steps (and "property"): drafts from before. */
  step: StepId | "property" | 1 | 2 | 3;
  prop: PropertyConfig | null;
  pv?: Counts;
  brief?: string;
  refs?: string;
  /** Content shoot by length (25 Oct 2026; v2 28 Oct 2026: edits by quantity, long-form lengths). */
  hours?: ContentHours;
  raw?: boolean;
  shortN?: number | null;
  /** Older drafts: how many long-form edits (no lengths). */
  longN?: number;
  longs?: number[];
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

/**
 * Book a shoot on the Book media page (owner, 10 Oct 2026; page, 18 Oct 2026). Property shoot:
 * type and size, then Photography (+ Twilight images), a 360° virtual tour and Video (short-form
 * and long-form counters), any combination. Content shoot, one screen: Edited (a fixed
 * count, or flexible: Half or Full day) or Raw files (Half or Full day), short-form and/or
 * long-form, an optional rough count, and a brief.
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
  // A content shoot (owner, 25 Oct 2026; pricing v2, 28 Oct 2026): a length (shoot only, raw files),
  // then short-form and long-form edits by quantity, nothing included. An older content booking (by
  // count, by time, or by length before v2) opens in this shape.
  const c0 = p0 ? undefined : v0;
  const [hours, setHours] = useState<ContentHours>(
    c0?.by === "hours" && isContentHours(c0.hours)
      ? c0.hours
      : c0?.by === "time" && c0.day === "full"
        ? 8
        : 4,
  );
  const [shortN, setShortN] = useState(c0 && c0.by !== "time" && !c0.raw ? (c0.short ?? 0) : 0);
  /** Each long-form edit's length (minutes); older bookings without lengths open at 10 min. */
  const [longs, setLongs] = useState<number[]>(
    c0 && c0.by !== "time" && !c0.raw
      ? (c0.longs ?? Array.from({ length: c0.long ?? 0 }, () => 10)).slice(0, CONTENT_LONG_MAX_V2)
      : [],
  );
  /** "Can you fit this in 4 hours?" (asked once per length; never blocks). */
  const [fitAsk, setFitAsk] = useState(false);
  const [fitOk, setFitOk] = useState<ContentHours | null>(null);
  const [date, setDate] = useState(edit?.date ?? "");
  const [startTime, setStartTime] = useState(edit?.startTime ?? "");
  const [loc, setLoc] = useState<BookingLocation>(edit?.location ?? { address: "" });
  const [note, setNote] = useState(n0.note);
  const [agent, setAgent] = useState(cfg.myContactId ?? "");
  const [touched, setTouched] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  // Payment terms (owner, 24 Oct 2026): the Booking Terms box, and an invoice issued at booking.
  const [agreed, setAgreed] = useState(false);
  const [termsErr, setTermsErr] = useState("");
  const [issued, setIssued] = useState<{
    number: string | null;
    amount: number;
    currency: string;
  } | null>(null);
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
  const counted = (c: Counts): VideoPlan =>
    cleanVideos({ by: "count", short: c.short, long: c.long, extra_min: c.extra_min });
  const plan: VideoPlan | null = isProp
    ? (keepPlan ?? (pVideo ? counted(pv) : null))
    : cleanVideos({ by: "hours", v: 2, hours, short: shortN, longs });
  const services: BookingService[] = [
    ...(isProp && propOk
      ? [{ service: "property" as const, property: photosOnly(toConfig(prop)) }]
      : []),
    ...(plan && (plan.by !== "count" || plan.short || plan.long)
      ? [{ service: "videos" as const, videos: plan }]
      : []),
  ];
  // Changing a booking (owner, 28 Oct 2026): date, time, place or notes keep the prices it was booked
  // at; only a change to the services or quantities re-prices it (at today's rates).
  const servicesKey = JSON.stringify(services);
  const [initialServices] = useState(servicesKey);
  const repriced = !!edit && servicesKey !== initialServices;
  const keepPrice = !!edit && !repriced;
  // No slot picker (owner, 18 Oct 2026): the slot follows the start time; a full day is Full day.
  const slot: Slot | "" =
    (plan?.by === "time" && plan.day === "full") || (plan?.by === "hours" && plan.hours === 8)
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
    hours,
    shortN,
    longs,
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
    if (isContentHours(d.hours)) setHours(d.hours);
    setShortN(d.raw ? 0 : (d.shortN ?? 0));
    setLongs(
      d.raw
        ? []
        : (d.longs ?? Array.from({ length: d.longN ?? 0 }, () => 10))
            .filter(isLongLength)
            .slice(0, CONTENT_LONG_MAX_V2),
    );
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
    discardOnly: true,
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
        : {}
      : step === "when"
        ? {
            date: (!date && "Choose a date.") || (date < cfg.today && "Choose a date from today."),
            start_time:
              (!startTime && "Choose a start time.") ||
              ((startTime < WHEEL_FROM || startTime > WHEEL_TO) &&
                "Choose a time between 08:00 and 18:45."),
            location: loc.address.trim().length < 3 && "Add the location.",
          }
        : {},
  );

  // Always worked out (labels for the summary); amounts are shown only with price access.
  const lines = estimateLines(services, cfg.price.rates ?? {}, pricing);
  // What's due now by the payment term (price access only), and the half-days it uses.
  const est = cfg.price.rates ? estimate(services, cfg.price.rates, pricing) : null;
  const halfDays = halfDaysOf({
    hasVideo: services.some((x) => x.service === "videos"),
    slot,
    fullDay: plan?.by === "time" && plan.day === "full",
    hours: plan?.by === "hours" ? plan.hours : null,
  });
  const v = priceView(cfg, lines);
  const { m } = v;
  const pText = propertyText(prop, pricing);
  const sub: Record<string, string> = {
    [KEY.photos]: pText,
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

  const needed = hoursNeeded(shortN, longs.length);
  const fitsIn = CONTENT_HOURS.find((h) => h >= needed) ?? 8;
  function next() {
    if (!form.check()) return;
    form.reset();
    // Content shoot: 1 hour per short-form edit, 2 per long-form. Over the length, ask once.
    if (!isProp && step === "services" && needed > hours && fitOk !== hours) {
      setFitAsk(true);
      return;
    }
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
    if (!edit && !agreed) {
      setTermsErr("Tick the box to agree to the Booking Terms.");
      return;
    }
    const b = {
      date,
      slot,
      startTime: startTime || undefined,
      location: loc,
      services,
      note: savedNote,
    };
    start(async () => {
      const r = edit
        ? await updateBooking(edit.projectId, { ...b, keepServices: keepPrice })
        : await bookShoot({ ...b, agent, termsAccepted: agreed });
      if (!r.ok) return form.fail(r.error ?? "Couldn’t send the booking. Try again.");
      // 50% / 100% with card payments on: straight to Stripe (paid = confirmed).
      if (r.payUrl) {
        window.location.assign(r.payUrl);
        return;
      }
      setIssued(r.invoice ?? null);
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
            : issued
              ? `Invoice ${issued.number ?? ""} for ${issued.currency} ${Number(issued.amount).toLocaleString("en-US")} is on the booking page: pay by bank transfer${cfg.card ? " or card" : ""} and upload the receipt. Your booking is confirmed once it’s paid.`
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
  /** The commercial tier's own data (description, what it includes). */
  const tier = commercial ? pricing.commercial.tiers[prop.size] : null;
  const tourLocked = isLocked(prop, "tour", pricing);
  const twi = twilightTable(prop, pricing);
  const setP = touch((patch: Partial<Counts>) => setPv((x) => ({ ...x, ...patch })));
  const photoSub = prices.photo + (prop.twilight ? twi[prop.twilightQty] : 0);
  const plain = (n: number | null | undefined, plus = false) =>
    v.rates && n != null ? <span className="bkp-price">{`${plus ? "+" : ""}${m(n)}`}</span> : null;

  // "Your booking" lists the property's parts on their own lines (display only: the stored estimate
  // line stays one "Photos · …" line). Falls back to that line if the parts don't add up.
  const at0 = lines.findIndex((l) => l.key === KEY.photos);
  let panelRows: PanelLine[] = panelLines;
  let panelV: PriceView = v;
  if (at0 >= 0 && lines[at0].amount != null) {
    const parts: { label: string; sub?: string; amount: number }[] = [];
    if (prop.photo)
      parts.push({
        label: "Photography",
        sub: propertyTitle(prop, pricing),
        amount: prices.photo,
      });
    if (prop.photo && prop.twilight)
      parts.push({
        label: `Twilight × ${prop.twilightQty}`,
        sub: "Edited from your daylight photos",
        amount: twi[prop.twilightQty],
      });
    if (prop.tour && prices.tour != null) parts.push({ label: "360° tour", amount: prices.tour });
    const sum = Math.round(parts.reduce((n, x) => n + x.amount, 0) * 100) / 100;
    if (parts.length && Math.abs(sum - Number(lines[at0].amount)) < 0.01) {
      const base = v.items[at0];
      panelRows = [
        ...panelLines.slice(0, at0),
        ...parts.map((x) => ({ label: x.label, sub: x.sub })),
        ...panelLines.slice(at0 + 1),
      ];
      panelV = {
        ...v,
        items: [
          ...v.items.slice(0, at0),
          ...parts.map((x) => ({
            ...base,
            key: undefined,
            qty: 1,
            amount: v.rates ? x.amount : null,
            unit: v.rates ? x.amount : null,
          })),
          ...v.items.slice(at0 + 1),
        ],
      };
    }
  }

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
          onChange={(t) => propAct({ type: "setType", id: 1, value: t })}
        />
      </div>
      {commercial ? (
        <div className="bkp-group">
          <span className="bkp-muted">Scale</span>
          <div
            className="bkp-cards bkp-cards-tiers"
            role="group"
            aria-label="Scale"
            data-testid="photo-price"
          >
            {pricing.commercial.tiers.map((t, i) => (
              <ServiceCard
                key={t.label}
                title={t.label}
                line={t.description}
                meta={t.popular ? <span className="pt-badge">Most popular</span> : null}
                on={prop.size === i}
                onToggle={() => propAct({ type: "update", id: 1, patch: { size: i } })}
              />
            ))}
          </div>
          {tier && (
            <dl className="bkp-includes" aria-label={`${tier.label} includes`}>
              <div>
                <dt>Photos</dt>
                <dd>{tier.includes.photos}</dd>
              </div>
              <div>
                <dt>360 tour</dt>
                <dd>{tier.includes.tourHotspots ?? "not available"}</dd>
              </div>
            </dl>
          )}
        </div>
      ) : (
        <div className="bkp-group">
          <span className="bkp-muted">Size</span>
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
      )}
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
            sub={tourLocked ? "360 tour: not available" : DELIVERY.tour}
            checked={prop.tour}
            disabled={tourLocked}
            right={tourLocked ? null : plain(prices.tour)}
            onChange={() => propAct({ type: "toggle", id: 1, key: "tour" })}
          />
        </div>
        <div className="bkp-box-card" data-on={pv.short > 0 ? "" : undefined}>
          <div className="bkp-row">
            <Check
              label="Short-form reel"
              sub={`Shot + edited · 30–90 sec · ${DELIVERY.short.toLowerCase()}`}
              checked={pv.short > 0}
              right={pv.short > 0 ? <PriceTag s={shown(KEY.short)} v={v} /> : offPrice(KEY.short)}
              onChange={() => setP({ short: pv.short > 0 ? 0 : 1 })}
            />
          </div>
        </div>
        <div className="bkp-box-card" data-on={pv.long > 0 ? "" : undefined}>
          <div className="bkp-row">
            <Check
              label="Long-form walkthrough"
              sub={`Up to ${LONG_FORM_MINUTES} min · shot + edited · ${DELIVERY.long}`}
              checked={pv.long > 0}
              right={pv.long > 0 ? <PriceTag s={shown(KEY.long)} v={v} /> : offPrice(KEY.long)}
              onChange={() => setP(pv.long > 0 ? { long: 0, extra_min: 0 } : { long: 1 })}
            />
          </div>
        </div>
        {form.errors.property && (
          <span className="pt-field-msg" role="alert">
            {form.errors.property}
          </span>
        )}
      </div>
    </>
  );

  /* ---------- step 1: content shoot (owner, 25 Oct 2026; pricing v2, 28 Oct 2026) ---------- */
  // One screen: the length (2 / 4 / 8 h, shoot only, raw files), then short-form and long-form edits
  // by quantity (each long-form with its length), a live summary, then the brief.
  const at8 = CONTENT_HOURS.indexOf(hours);
  const priceOf = (key: string) => (v.rates && rate(key) != null ? m(rate(key)!) : null);
  const longOf = (min: number) => (v.rates ? longPrice(min, rate(longKey(min))) : null);
  const setLong = touch((i: number, min: number) =>
    setLongs((ls) => ls.map((x, j) => (j === i ? min : x))),
  );
  const contentStep = (
    <>
      <div className="bkp-group" data-testid="content-length">
        <div className="bkp-row">
          <span className="bkp-body">Shoot length</span>
          <b className="bkp-price" data-testid="length-price">
            {hours} hours{priceOf(CONTENT_KEY[hours]) ? ` · ${priceOf(CONTENT_KEY[hours])}` : ""}
          </b>
        </div>
        <span className="bkp-muted">Shoot only — you get the raw files. Add edits below.</span>
        <input
          type="range"
          className="bkp-slider"
          min={0}
          max={CONTENT_HOURS.length - 1}
          step={1}
          value={at8}
          aria-label="Shoot length"
          aria-valuetext={`${hours} hours`}
          style={{ ["--pct" as string]: `${(at8 / (CONTENT_HOURS.length - 1)) * 100}%` }}
          onChange={touch((e: React.ChangeEvent<HTMLInputElement>) =>
            setHours(CONTENT_HOURS[Number(e.target.value)]),
          )}
        />
        <div className="bkp-ticks" aria-hidden="true">
          {CONTENT_HOURS.map((h) => (
            <button
              key={h}
              type="button"
              tabIndex={-1}
              data-on={h === hours ? "" : undefined}
              onClick={touch(() => setHours(h))}
            >
              <b>{h} h</b>
              {priceOf(CONTENT_KEY[h]) && <small>{priceOf(CONTENT_KEY[h])}</small>}
            </button>
          ))}
        </div>
      </div>
      <div className="bkp-box-card bkp-edits">
        <div className="bkp-row">
          <span className="bkp-body">Edits</span>
        </div>
        <div className="bkp-row">
          <span className="bkp-check-t">
            Short-form edits
            <span className="bkp-muted">
              Up to 60 sec
              {priceOf(CONTENT_KEY.short) ? ` · ${priceOf(CONTENT_KEY.short)} each` : ""} · within
              48 h
            </span>
          </span>
          <Counter
            label="Short-form edits"
            value={shortN}
            min={0}
            onChange={touch((n: number) => setShortN(n))}
          />
        </div>
        <div className="bkp-row">
          <span className="bkp-check-t">
            Long-form edits
            <span className="bkp-muted">
              YouTube, priced by length · 48–72 h · over 30 min, we quote
            </span>
          </span>
          <Counter
            label="Long-form edits"
            value={longs.length}
            min={0}
            max={CONTENT_LONG_MAX_V2}
            onChange={touch((n: number) =>
              setLongs((ls) =>
                n > ls.length
                  ? [...ls, ...Array.from({ length: n - ls.length }, () => 10)]
                  : ls.slice(0, n),
              ),
            )}
          />
        </div>
        {longs.map((min, i) => {
          const at = LONG_LENGTHS.indexOf(min as (typeof LONG_LENGTHS)[number]);
          return (
            <div className="bkp-lform" key={i}>
              <span className="bkp-muted">Long-form {i + 1}</span>
              <input
                type="range"
                className="bkp-slider"
                min={0}
                max={LONG_LENGTHS.length - 1}
                step={1}
                value={at < 0 ? 1 : at}
                aria-label={`Long-form ${i + 1} length`}
                aria-valuetext={`${min} min`}
                style={{
                  ["--pct" as string]: `${((at < 0 ? 1 : at) / (LONG_LENGTHS.length - 1)) * 100}%`,
                }}
                onChange={(e) => setLong(i, LONG_LENGTHS[Number(e.target.value)])}
              />
              <b className="bkp-lform-v">
                {min} min{longOf(min) != null ? ` · ${m(longOf(min)!)}` : ""}
                {v.rates && rate(longKey(min)) != null && (
                  <small className="bkp-muted"> · {m(rate(longKey(min))!)}/min</small>
                )}
              </b>
            </div>
          );
        })}
      </div>
      <label className="pt-field">
        Brief
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
  // Date and arrival time side by side (owner, 25 Oct 2026): a month calendar and a looping time
  // wheel, both popovers over the page.
  const whenStep = (
    <>
      <div className="bkp-when bkp-2col">
        <Field name="date" label="Date" required group error={form.errors.date}>
          <DatePicker
            value={date}
            min={cfg.today}
            invalid={!!form.errors.date}
            onChange={touch((x: string) => setDate(x))}
          />
        </Field>
        <Field name="start_time" label="Arrival time" required group error={form.errors.start_time}>
          <TimeWheel
            value={startTime}
            from={WHEEL_FROM}
            to={WHEEL_TO}
            placeholder="Choose a time"
            clearable={false}
            loop
            label="Arrival time"
            invalid={!!form.errors.start_time}
            onChange={touch((x: string) => setStartTime(x))}
          />
        </Field>
      </div>
      <PlacesField
        value={loc}
        onChange={touch((x: BookingLocation) => setLoc(x))}
        error={form.errors.location}
      />
      {/* Content shoots: the brief covers it (owner, 19 Oct 2026); Access stays. */}
      {isProp && (
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
      )}
    </>
  );

  /* ---------- step 3: summary ---------- */
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
      rows: [whenLabel(date, startTime) || dateLabel(date, { weekday: "short" })],
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
      {!edit && <DueLine terms={cfg.terms} estimate={est} currency={cfg.price.currency} />}
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
      {edit && v.rates && (
        <p className="pt-note" role="status" data-testid="edit-price">
          {repriced
            ? `You changed the services, so this booking is priced at today’s rates: new total ${
                est != null ? m(est) : "priced on confirmation"
              }${edit.estimate != null ? ` (was ${m(Number(edit.estimate))})` : ""}.`
            : `Prices stay as booked${edit.estimate != null ? `: ${m(Number(edit.estimate))}` : ""}. Changing the services re-prices it.`}
        </p>
      )}
      {/* Phones: the side panel isn't shown, so the prices go here. */}
      {!keepPrice && (
        <div className="bkp-box-card bkp-phone-only">
          <BookingPanel lines={panelRows} v={panelV} />
        </div>
      )}
      {!edit && (
        <>
          <DueNow
            terms={cfg.terms}
            estimate={est}
            currency={cfg.price.currency}
            halfDays={halfDays}
            flexible={false}
          />
          <TermsCheck
            checked={agreed}
            onChange={(x) => {
              setAgreed(x);
              if (x) setTermsErr("");
            }}
            error={termsErr}
          />
        </>
      )}
    </>
  );

  const confirmLabel = pending
    ? "Sending…"
    : edit?.status === "confirmed"
      ? "Send change request"
      : edit
        ? "Save changes"
        : confirmText(cfg.terms, est, cfg.card, cfg.price.currency);
  const barText =
    keepPrice && v.rates && edit?.estimate != null
      ? m(Number(edit.estimate))
      : v.pkg && v.due != null
        ? m(v.due)
        : (v.total?.value ?? (lines.length ? plural(lines.length, "item") : "Nothing yet"));

  return (
    <>
      <BookStep
        label={`Step ${at + 1} of ${STEPS.length}`}
        eyebrow={
          edit ? (edit.status === "confirmed" ? "Request a change" : "Edit details") : "Book media"
        }
        icon={isProp ? "building" : "video"}
        heading={isProp ? "Property shoot" : "Content shoot"}
        steps={{ labels: ["01 Details", "02 Where & when", "03 Review"], at }}
        onBack={at > 0 || onBack ? back : undefined}
        primary={
          step === "review"
            ? { label: confirmLabel, onClick: confirm, disabled: pending || !services.length }
            : { label: "Next", onClick: next }
        }
        panel={
          <>
            {keepPrice ? (
              <p className="bkp-muted">
                {v.rates && edit?.estimate != null ? `Booked at ${m(Number(edit.estimate))}. ` : ""}
                Prices stay as booked unless you change the services.
              </p>
            ) : (
              <BookingPanel lines={panelRows} v={panelV} />
            )}
            {!edit && <PanelTerms terms={cfg.terms} estimate={est} currency={cfg.price.currency} />}
          </>
        }
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
      {fitAsk && (
        <ChoiceDialog
          title={`Can you fit this in ${hours} hours?`}
          body={
            <p>
              {rate(CONTENT_KEY.overtime) != null
                ? `If the shoot runs past ${hours} hours, each extra hour is ${m(rate(CONTENT_KEY.overtime)!)}.`
                : `If the shoot runs past ${hours} hours, each extra hour is charged as overtime.`}
            </p>
          }
          onDismiss={() => setFitAsk(false)}
          choices={[
            {
              label: `Yes, keep ${hours}h`,
              onClick: () => {
                setFitAsk(false);
                setFitOk(hours);
                onStep("when");
              },
            },
            ...(fitsIn > hours
              ? [
                  {
                    label: `Switch to ${fitsIn}h`,
                    primary: true,
                    onClick: () => {
                      setFitAsk(false);
                      setTouched(true);
                      setHours(fitsIn);
                      setFitOk(fitsIn);
                      onStep("when");
                    },
                  },
                ]
              : []),
          ]}
        />
      )}
      {leave}
    </>
  );
}
