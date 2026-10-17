"use client";

import Link from "next/link";
import { useReducer, useState, useTransition } from "react";
import {
  blankProperty,
  reducer,
  servicesText,
  title as propertyTitle,
  type Action,
  type BookingProperty,
} from "@/lib/booking";
import { bookShoot, updateBooking } from "@/lib/portal/book-actions";
import {
  cleanVideos,
  estimateLines,
  normalizeServices,
  photosOnly,
  asProperty,
  serviceSummary,
  SERVICE_LABEL,
  SLOTS,
  slotHours,
  type BookingLocation,
  type BookingService,
  type PropertyConfig,
  type Slot,
  type VideoPlan,
} from "@/lib/portal/booking";
import { TURNAROUND_DEFAULT } from "@/lib/portal/booking-labels";
import type { RequestConfig } from "@/lib/portal/requests";
import { DraftOffer, FormBanner, useDraft, useLeaveGuard } from "../forms";
import { Icon } from "../Icon";
import { PlacesField } from "../PlacesField";
import { Sheet } from "../ui";
import {
  LONG_CHIPS,
  PropertyStep,
  ScheduleStep,
  ServicesStep,
  SHORT_CHIPS,
  timeLabel,
} from "./BookingSteps";
import { PriceBlock, summarize, type SumItem } from "./pricing-ui";

/*
 * Book a shoot as a full page (UI rebuild, 17 Oct 2026). Services → Property (only with Photos) →
 * Schedule → Location → Summary, with a sticky "Your booking" card. Same state, validation rules,
 * drafts, estimate and server calls as the old modal; only the way it's laid out changed.
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

type StepKey = "services" | "property" | "schedule" | "location" | "summary";
const LABEL: Record<StepKey, string> = {
  services: "Services",
  property: "Property",
  schedule: "Schedule",
  location: "Location",
  summary: "Summary",
};
const VIDEO0: VideoPlan = { by: "count", short: 4, long: 1, extra_min: 0, day: "half" };

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

/* The "Includes" chips ride in the booking's existing note, as lines before the client's own text. */
type Incl = { short: string[]; long: string[] };
const INCL_LINE = /^(Short-form|Walkthrough) includes: (.*)\.$/;
function composeNote(incl: Incl, on: { short: boolean; long: boolean }, note: string) {
  const lines = [
    on.short && incl.short.length ? `Short-form includes: ${incl.short.join(", ")}.` : "",
    on.long && incl.long.length ? `Walkthrough includes: ${incl.long.join(", ")}.` : "",
  ].filter(Boolean);
  return [...lines, ...(lines.length && note.trim() ? [""] : []), note].join("\n");
}
function splitNote(raw: string): { incl: Incl; note: string } {
  const incl: Incl = { short: [], long: [] };
  const rest = (raw ?? "").split("\n");
  while (rest.length) {
    const m = INCL_LINE.exec(rest[0]);
    if (!m) break;
    const k = m[1] === "Short-form" ? "short" : "long";
    const known: readonly string[] = k === "short" ? SHORT_CHIPS : LONG_CHIPS;
    incl[k] = m[2].split(", ").filter((c) => known.includes(c));
    rest.shift();
  }
  if (rest[0] === "" && (incl.short.length || incl.long.length)) rest.shift();
  return { incl, note: rest.join("\n") };
}

/** What stops a step from continuing (null = fine). The same rules the modal checked. */
type Form = {
  photosOn: boolean;
  shortOn: boolean;
  longOn: boolean;
  /** A card is on but books none (an old draft or edit with no count). */
  empty: boolean;
  date: string;
  slot: Slot | "";
  startTime: string;
  loc: BookingLocation;
};
function blocker(k: StepKey, f: Form, today: string): string | null {
  if (k === "services") {
    if (!f.photosOn && !f.shortOn && !f.longOn) return "Choose at least one service.";
    if (f.empty) return "Add at least one video, or choose a half or full day.";
    return null;
  }
  if (k === "schedule") {
    if (!f.date) return "Choose a date.";
    if (f.date < today) return "Choose a date from today.";
    if (!SLOTS.some(([s]) => s === f.slot)) return "Choose a slot.";
    const [from, to] = slotHours(f.slot);
    if (f.startTime && (f.startTime < from || f.startTime > to))
      return "Choose a start time inside the slot.";
    return null;
  }
  if (k === "location") return f.loc.address.trim().length < 3 ? "Add the location." : null;
  return null;
}

type Snap = {
  v: 2;
  step: StepKey;
  startTime?: string;
  kinds?: string[];
  video?: VideoPlan;
  on?: { short: boolean; long: boolean };
  incl?: Incl;
  prop: PropertyConfig | null;
  date: string;
  slot: Slot | "";
  loc: BookingLocation;
  note: string;
};
/** Drafts saved by the old modal had steps 1 to 3: services, when and where, summary. */
const OLD_STEP: Record<number, StepKey> = { 1: "services", 2: "schedule", 3: "summary" };

const longDay = (d: string) =>
  new Date(`${d}T00:00:00Z`).toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });
const shortDay = (d: string) =>
  new Date(`${d}T00:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });

/** The "Your booking" card: the lines, the total, and the chosen day. Also the phone's bottom sheet. */
function BookingCard({
  items,
  totalText,
  when,
  heading = true,
}: {
  items: SumItem[];
  totalText: string | null;
  when: string;
  /** The phone's sheet already has the title. */
  heading?: boolean;
}) {
  return (
    <section className="pt-bk-sum" aria-label="Your booking" data-testid="booking-summary">
      {heading && <span className="pt-eb">Your booking</span>}
      {items.length ? (
        <ul className="pt-bk-sum-list">
          {items.map((it, i) => (
            <li key={i}>
              <span>{it.label}</span>
              {it.price && <span className="pt-mono">{it.price}</span>}
            </li>
          ))}
        </ul>
      ) : (
        <p className="pt-meta">Choose what you need and it adds up here.</p>
      )}
      {totalText && (
        <div className="pt-bk-sum-total">
          <span>Estimated total</span>
          <b>{totalText}</b>
        </div>
      )}
      {when && <span className="pt-bk-sum-when">{when}</span>}
    </section>
  );
}

function Flow({
  cfg,
  resume,
  edit,
  onAgain,
}: {
  cfg: RequestConfig;
  resume?: boolean;
  edit?: BookingEdit;
  onAgain: () => void;
}) {
  const { pricing } = cfg;
  // An older booking is read in today's shape (lib/portal/booking normalizeServices).
  const s0 = normalizeServices(edit?.services ?? []);
  const v0 = s0.find((x) => x.service === "videos")?.videos;
  const p0 = s0.find((x) => x.service === "property" && x.property)?.property;
  const n0 = splitNote(edit?.note ?? "");

  const [photosOn, setPhotosOn] = useState(!!p0);
  const [video, setVideo] = useState<VideoPlan>({ ...VIDEO0, ...v0 });
  // By time both cards are one plan: an edited booking shows both as added.
  const [shortOn, setShortOn] = useState(v0 ? v0.by === "time" || (v0.short ?? 0) > 0 : false);
  const [longOn, setLongOn] = useState(v0 ? v0.by === "time" || (v0.long ?? 0) > 0 : false);
  const [incl, setIncl] = useState<Incl>(n0.incl);
  const [date, setDate] = useState(edit?.date ?? "");
  const [slot, setSlot] = useState<Slot | "">(edit?.slot ?? "");
  const [startTime, setStartTime] = useState(edit?.startTime ?? "");
  const [loc, setLoc] = useState<BookingLocation>(edit?.location ?? { address: "" });
  const [note, setNote] = useState(n0.note);
  const [agent, setAgent] = useState(cfg.myContactId ?? "");
  const [touched, setTouched] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sheet, setSheet] = useState(false);
  const [pending, start] = useTransition();
  const [prop, dispatchProp] = useReducer(
    (p: BookingProperty, a: Action) =>
      reducer(pricing)({ properties: [p], nextId: 2 }, a).properties[0],
    blankProperty(1, pricing, "", ""),
    (p) => (p0 ? { ...p, ...p0 } : p),
  );

  const videosOn = shortOn || longOn;
  // By count, a card that's off books none of its kind; by time both cards are the one plan.
  const planned: VideoPlan =
    video.by === "time"
      ? video
      : { ...video, short: shortOn ? video.short : 0, long: longOn ? video.long : 0 };
  const videos = cleanVideos(planned);
  const empty = videosOn && videos.by === "count" && !videos.short && !videos.long;
  const form: Form = { photosOn, shortOn, longOn, empty, date, slot, startTime, loc };
  // An edit opens where the booking still needs something, else on the summary.
  const [step, setStep] = useState<StepKey>(() => {
    if (!edit) return "services";
    const f: Form = {
      photosOn: !!p0,
      shortOn: v0 ? v0.by === "time" || (v0.short ?? 0) > 0 : false,
      longOn: v0 ? v0.by === "time" || (v0.long ?? 0) > 0 : false,
      empty: false,
      date: edit.date,
      slot: edit.slot,
      startTime: edit.startTime ?? "",
      loc: edit.location,
    };
    return (
      (["services", "schedule", "location"] as const).find((k) => blocker(k, f, cfg.today)) ??
      "summary"
    );
  });

  const touch =
    <A extends unknown[]>(f: (...a: A) => void) =>
    (...a: A) => {
      setTouched(true);
      f(...a);
    };
  const setV = touch((patch: Partial<VideoPlan>) => setVideo((v) => ({ ...v, ...patch })));

  const steps: StepKey[] = photosOn
    ? ["services", "property", "schedule", "location", "summary"]
    : ["services", "schedule", "location", "summary"];
  const at = Math.max(0, steps.indexOf(step));
  const here = steps[at];

  const services: BookingService[] = [
    ...(photosOn ? [{ service: "property" as const, property: photosOnly(toConfig(prop)) }] : []),
    ...(videosOn && !empty ? [{ service: "videos" as const, videos }] : []),
  ];

  const snap: Snap = {
    v: 2,
    step: here,
    startTime,
    kinds: [...(photosOn ? ["property"] : []), ...(videosOn ? ["videos"] : [])],
    video,
    on: { short: shortOn, long: longOn },
    incl,
    prop: photosOn ? toConfig(prop) : null,
    date,
    slot,
    loc,
    note,
  };
  const restore = (d: Snap) => {
    const kinds = d.kinds ?? [];
    const v = { ...VIDEO0, ...(d.video ?? {}) };
    setPhotosOn(kinds.includes("property"));
    setVideo(v);
    // Drafts from the old modal have no card flags: a card is on if it had videos of its kind.
    const wasVideos = kinds.includes("videos");
    setShortOn(d.on ? d.on.short : wasVideos && (v.by === "time" || (v.short ?? 0) > 0));
    setLongOn(d.on ? d.on.long : wasVideos && (v.by === "time" || (v.long ?? 0) > 0));
    setIncl(d.incl ?? { short: [], long: [] });
    setStartTime(d.startTime ?? "");
    setDate(d.date ?? "");
    setSlot(d.slot ?? "");
    setLoc(d.loc ?? { address: "" });
    setNote(d.note ?? "");
    if (d.prop) dispatchProp({ type: "update", id: 1, patch: { ...d.prop } });
    const s = typeof d.step === "number" ? OLD_STEP[d.step as number] : d.step;
    setStep(s && LABEL[s] ? s : "services");
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

  const stop = blocker(here, form, cfg.today);
  // Always worked out (labels for the summary); amounts are shown only with price access.
  const lines = estimateLines(services, cfg.price.rates ?? {}, pricing);
  const total = cfg.price.rates ? lines.reduce((n, l) => n + (l.amount ?? 0), 0) : null;
  const sum = summarize(cfg, lines);

  /** By time, the day is the slot length: a full day books the Full day slot. */
  function chooseDay(d: "half" | "full") {
    setTouched(true);
    setVideo((v) => ({ ...v, by: "time", day: d }));
    if (d === "full") setSlot("full_day");
    else if (slot === "full_day") setSlot("");
  }
  function chooseSlot(k: Slot) {
    setTouched(true);
    setSlot(k);
    const [a, b] = slotHours(k);
    if (startTime && (startTime < a || startTime > b)) setStartTime("");
    if (videosOn && video.by === "time")
      setVideo((v) => ({ ...v, day: k === "full_day" ? "full" : "half" }));
  }
  const turnOn = (k: "short" | "long", on: boolean) => {
    setTouched(true);
    if (k === "short") setShortOn(on);
    else setLongOn(on);
    // Turning a card on starts it at one (reels at the usual four).
    if (on && video.by === "count")
      setVideo((v) => ({ ...v, [k]: (v[k] ?? 0) > 0 ? v[k] : k === "short" ? 4 : 1 }));
  };
  const toggleIncl = touch((k: "short" | "long", chip: string) =>
    setIncl((i) => ({
      ...i,
      [k]: i[k].includes(chip) ? i[k].filter((c) => c !== chip) : [...i[k], chip],
    })),
  );

  function go(to: StepKey) {
    setError(null);
    setStep(to);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function next() {
    if (stop) return;
    go(steps[Math.min(steps.length - 1, at + 1)]);
  }
  function confirm() {
    if (!services.length) return;
    const b = {
      date,
      slot: slot as Slot,
      startTime: startTime || undefined,
      location: loc,
      services,
      note: composeNote(incl, { short: shortOn, long: longOn }, note),
    };
    start(async () => {
      const r = edit ? await updateBooking(edit.projectId, b) : await bookShoot({ ...b, agent });
      if (!r.ok) return setError(r.error ?? "Couldn’t send the booking. Try again.");
      setDone(edit ? edit.ref : r.ref!);
      window.scrollTo({ top: 0 });
    });
  }

  const whatRows = services.map((x) => ({
    key: x.service,
    label: SERVICE_LABEL[x.service],
    text: serviceSummary(x, pricing),
  }));
  // The summary's Services lines: what's being booked, without the property (its own row).
  const whatLines = services.map((x) =>
    x.service === "property" && x.property
      ? servicesText(asProperty(x.property, pricing)).join(" + ")
      : serviceSummary(x, pricing),
  );
  const slotName = SLOTS.find(([k]) => k === slot)?.[1] ?? "";
  const whenText = date
    ? [longDay(date), slotName, startTime ? timeLabel(startTime) : ""].filter(Boolean).join(" · ")
    : "";
  const chip = date
    ? [shortDay(date), slotName, startTime ? timeLabel(startTime) : ""].filter(Boolean).join(" · ")
    : "";
  const where = [loc.address, loc.unit].filter(Boolean).join(" · ");
  const title = edit
    ? edit.status === "confirmed"
      ? "Request a change"
      : "Edit details"
    : "Book a shoot";
  const cta = pending
    ? "Sending…"
    : edit?.status === "confirmed"
      ? "Send change request"
      : edit
        ? "Save changes"
        : "Confirm booking";
  const ta = {
    photos: cfg.turnaround.property_shoot || TURNAROUND_DEFAULT.photos,
    short: cfg.turnaround.reels || TURNAROUND_DEFAULT.reels,
    long: cfg.turnaround.long_form || TURNAROUND_DEFAULT.long_form,
  };

  if (done)
    return (
      <div className="pt-bkpage" data-testid="booking-page">
        <div className="pt-done pt-bk-done" role="status">
          <span className="pt-done-ic" aria-hidden="true">
            <Icon name="check" size={28} />
          </span>
          <b className="pt-done-h">
            {edit?.status === "confirmed"
              ? "Change requested"
              : edit
                ? "Details saved"
                : "Thanks — your booking request is in"}
          </b>
          <p className="pt-done-p">
            {edit?.status === "confirmed" ? (
              "We’ll look at the change and confirm the shoot again by email."
            ) : (
              <>
                Booking <b className="pt-mono">{done}</b> is in. We’ll confirm your slot shortly by
                email.
              </>
            )}
          </p>
          {!edit && sum.totalText && (
            <p className="pt-bk-done-total">
              <span className="pt-eb">Estimated</span> <b>{sum.totalText}</b>
            </p>
          )}
          <ul className="pt-summary pt-done-card" aria-label="Booking details">
            <li>
              <span>Booking ID</span>
              <b className="pt-mono">{done}</b>
            </li>
            {whatRows.map((w) => (
              <li key={w.key}>
                <span>{w.label}</span>
                <b>{w.text}</b>
              </li>
            ))}
            <li>
              <span>Date and slot</span>
              <b>{whenText}</b>
            </li>
            <li>
              <span>Location</span>
              <b>{where}</b>
            </li>
          </ul>
          <div className="pt-btns pt-bk-done-btns">
            <Link href={`/portal/shoots/${encodeURIComponent(done)}`} className="btn btn-p">
              Track booking
            </Link>
            {edit ? (
              <Link href="/portal/shoots" className="btn btn-g">
                All shoots
              </Link>
            ) : (
              <button type="button" className="btn btn-g" onClick={onAgain}>
                Book another
              </button>
            )}
          </div>
        </div>
      </div>
    );

  return (
    <div className="pt-bkpage" data-testid="booking-page">
      <div className="pt-head">
        <div>
          <span className="pt-eb">{edit ? edit.ref : "Book media"}</span>
          <h1 className="pt-h1">{title}</h1>
        </div>
      </div>
      <DraftOffer offer={draft.offer} onContinue={draft.continueOffer} onFresh={draft.startFresh} />

      <ol className="pt-bk-steps" aria-label="Steps">
        {steps.map((k, i) => {
          const state = i < at ? "done" : i === at ? "current" : "next";
          return (
            <li key={k} data-state={state} aria-current={state === "current" ? "step" : undefined}>
              <button
                type="button"
                disabled={state !== "done"}
                aria-label={state === "done" ? `Back to ${LABEL[k]}` : LABEL[k]}
                onClick={() => go(k)}
              >
                <span className="pt-bk-dot" aria-hidden="true">
                  {state === "done" ? <Icon name="check" size={14} /> : i + 1}
                </span>
                <span className="pt-bk-slabel">{LABEL[k]}</span>
              </button>
            </li>
          );
        })}
      </ol>
      <FormBanner text={error} />

      <div className="pt-bk-grid">
        <div className="pt-bk-main">
          {here === "services" && (
            <ServicesStep
              cfg={cfg}
              turnaround={ta}
              photosOn={photosOn}
              setPhotosOn={touch(setPhotosOn)}
              prop={prop}
              dispatchProp={(a) => {
                setTouched(true);
                dispatchProp(a);
              }}
              video={video}
              setV={setV}
              shortOn={shortOn}
              longOn={longOn}
              setShortOn={(on) => turnOn("short", on)}
              setLongOn={(on) => turnOn("long", on)}
              incl={incl}
              toggleIncl={toggleIncl}
              chooseDay={chooseDay}
            />
          )}
          {here === "property" && (
            <PropertyStep
              cfg={cfg}
              prop={prop}
              dispatchProp={(a) => {
                setTouched(true);
                dispatchProp(a);
              }}
            />
          )}
          {here === "schedule" && (
            <ScheduleStep
              today={cfg.today}
              date={date}
              setDate={touch(setDate)}
              slot={slot}
              chooseSlot={chooseSlot}
              startTime={startTime}
              setStartTime={touch(setStartTime)}
            />
          )}
          {here === "location" && (
            <div className="pt-bk-step" data-testid="step-location">
              <h2 className="pt-h2">Where is the shoot?</h2>
              <PlacesField value={loc} onChange={touch((v: BookingLocation) => setLoc(v))} />
            </div>
          )}
          {here === "summary" && (
            <div className="pt-bk-step" data-testid="step-summary">
              <h2 className="pt-h2">Check and confirm</h2>
              <dl className="pt-bk-table">
                <div>
                  <dt>Services</dt>
                  <dd>
                    {whatLines.map((t, i) => (
                      <span key={i}>
                        {t}
                        <br />
                      </span>
                    ))}
                  </dd>
                </div>
                {photosOn && (
                  <div>
                    <dt>Property</dt>
                    <dd>{propertyTitle(asProperty(toConfig(prop), pricing), pricing)}</dd>
                  </div>
                )}
                <div>
                  <dt>Date &amp; time</dt>
                  <dd>{whenText}</dd>
                </div>
                <div>
                  <dt>Location</dt>
                  <dd>{where}</dd>
                </div>
                {loc.access && (
                  <div>
                    <dt>Access</dt>
                    <dd>{loc.access}</dd>
                  </div>
                )}
              </dl>
              {!edit && cfg.agents.length > 0 && (
                <label className="pt-field">
                  Agent
                  <select
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
                </label>
              )}
              <label className="pt-field">
                Anything else we should know?
                <textarea
                  rows={2}
                  maxLength={2000}
                  value={note}
                  placeholder="Style, people on camera, rooms to focus on…"
                  onChange={touch((e: React.ChangeEvent<HTMLTextAreaElement>) =>
                    setNote(e.target.value),
                  )}
                />
              </label>
              <PriceBlock cfg={cfg} lines={lines} total={total} />
              <p className="pt-meta" style={{ margin: 0 }}>
                No payment now. We confirm the date and time, then it’s in Shoots.
              </p>
            </div>
          )}

          <div className="pt-bk-bar">
            <button
              type="button"
              className="pt-bk-sumbtn"
              aria-haspopup="dialog"
              onClick={() => setSheet(true)}
            >
              <span className="pt-eb">Your booking</span>
              <span>
                {sum.totalText ? (
                  <>
                    Estimated <b>{sum.totalText}</b>
                  </>
                ) : sum.items.length ? (
                  `${sum.items.length} item${sum.items.length > 1 ? "s" : ""}`
                ) : (
                  "Nothing yet"
                )}
              </span>
              <span className="pt-bk-chev" aria-hidden="true" />
            </button>
            <div className="pt-bk-nav">
              {at === 0 ? (
                <Link
                  href={edit ? `/portal/shoots/${encodeURIComponent(edit.ref)}` : "/portal"}
                  className="pt-bk-back"
                >
                  <Icon name="back" size={16} /> Back
                </Link>
              ) : (
                <button type="button" className="pt-bk-back" onClick={() => go(steps[at - 1])}>
                  <Icon name="back" size={16} /> Back
                </button>
              )}
              {here === "summary" ? (
                <button
                  type="button"
                  className="btn btn-p"
                  disabled={pending || !services.length}
                  onClick={confirm}
                >
                  {cta}
                </button>
              ) : (
                <button type="button" className="btn btn-p" disabled={!!stop} onClick={next}>
                  Continue <Icon name="chevron" size={16} />
                </button>
              )}
            </div>
            {stop && (
              <span className="pt-meta pt-bk-why" role="status">
                {stop}
              </span>
            )}
          </div>
        </div>
        <aside className="pt-bk-aside" aria-label="Your booking">
          <BookingCard items={sum.items} totalText={sum.totalText} when={chip} />
        </aside>
      </div>

      {sheet && (
        <Sheet title="Your booking" onClose={() => setSheet(false)}>
          <BookingCard items={sum.items} totalText={sum.totalText} when={chip} heading={false} />
        </Sheet>
      )}
      {leave}
    </div>
  );
}

/** "Book another" starts the whole flow over with fresh state. */
export function BookingFlow(props: { cfg: RequestConfig; resume?: boolean; edit?: BookingEdit }) {
  const [run, setRun] = useState(0);
  return <Flow key={run} {...props} onAgain={() => setRun((r) => r + 1)} />;
}
