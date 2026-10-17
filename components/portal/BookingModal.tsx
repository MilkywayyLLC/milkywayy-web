"use client";

import Link from "next/link";
import { useReducer, useState, useTransition } from "react";
import { PropertyOptions } from "@/components/booking/PropertyOptions";
import { blankProperty, reducer, type Action, type BookingProperty } from "@/lib/booking";
import { bookShoot, updateBooking } from "@/lib/portal/book-actions";
import { dateLabel, money } from "@/lib/portal/billing";
import {
  cleanVideos,
  DAY_LABEL,
  estimateLines,
  KEY,
  normalizeServices,
  packageLines,
  packageLineText,
  photosOnly,
  SERVICE_HINT,
  SERVICE_LABEL,
  serviceSummary,
  slotHours,
  SLOTS,
  VIDEO_LABEL,
  type BookingLocation,
  type BookingService,
  type PropertyConfig,
  type Slot,
  type VideoPlan,
} from "@/lib/portal/booking";
import type { RequestConfig } from "@/lib/portal/requests";
import {
  DraftOffer,
  Field,
  FormBanner,
  Modal,
  useCloseGuard,
  useDraft,
  useFormCheck,
} from "./forms";
import { Icon } from "./Icon";
import { DatePicker, TimeWheel } from "./Pickers";
import { PlacesField } from "./PlacesField";

type Kind = "property" | "videos";
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

/** The shown price of a request, by who's looking (shared with the avatar form). */
export function PriceBlock({
  cfg,
  lines,
  total,
}: {
  cfg: RequestConfig;
  lines?: {
    key?: string;
    label: string;
    qty: number;
    amount: number | null;
    minimum?: boolean;
  }[];
  total: number | null;
}) {
  const p = cfg.price;
  if (!p.rates) return null;
  // Package clients: each line Included (what's left this month) or Extra at their price.
  if (p.mode === "package" && p.left && lines?.length) {
    const pl = packageLines(
      lines.map((l) =>
        asExtraIfProperty({
          ...l,
          unit: l.qty ? (l.amount == null ? null : l.amount / l.qty) : null,
        }),
      ),
      p.left,
    );
    const extra = pl.reduce((n, l) => n + (l.amount ?? 0), 0);
    return (
      <div className="pt-estimate" data-testid="estimate">
        <ul className="pt-summary" aria-label="Estimate">
          {pl.map((l, i) => (
            <li key={i}>
              <span>
                {l.label}
                {l.qty > 1 ? ` × ${l.qty}` : ""}
              </span>
              <span className="pt-mono">{packageLineText(l, (n) => money(p.currency, n))}</span>
            </li>
          ))}
        </ul>
        <b>
          {extra > 0
            ? `Extras estimated ${money(p.currency, extra)}, on your month-end invoice.`
            : pl.some((l) => l.qty > l.included)
              ? "Extras are priced on confirmation, on your month-end invoice."
              : "Covered by your monthly package."}
        </b>
      </div>
    );
  }
  if (p.mode !== "payg")
    return (
      <p className="pt-estimate" data-testid="estimate">
        Counts toward your monthly package
        {p.showAmount && total ? ` (estimated ~${money(p.currency, total)})` : ""}.
      </p>
    );
  return (
    <div className="pt-estimate" data-testid="estimate">
      {lines && lines.length > 0 && (
        <ul className="pt-summary" aria-label="Estimate">
          {lines.map((l, i) => (
            <li key={i}>
              <span>
                {l.label}
                {l.qty > 1 ? ` × ${l.qty}` : ""}
              </span>
              <span className="pt-mono">
                {l.amount == null
                  ? "Priced on confirmation"
                  : `${l.minimum ? "at least " : ""}${money(p.currency, l.amount)}`}
              </span>
            </li>
          ))}
        </ul>
      )}
      <b>
        {lines?.some((l) => l.minimum)
          ? `Estimated from ${total ? money(p.currency, total) : "on confirmation"}. Videos are billed per finished video at your rates, or the minimum if that’s higher.`
          : `Estimated ${total ? money(p.currency, total) : "on confirmation"}. The final amount is set after the shoot.`}
      </b>
    </div>
  );
}

/** One line of the live summary: a selected type and what it costs (by who's looking). */
type SumItem = { label: string; price?: string };

/**
 * The live summary (owner, 17 Oct 2026): one line per selected type, then the total. Prices
 * follow PriceBlock: none without price access; package clients see Included / N extra (a
 * property shoot is always an extra at its price).
 */
function summarize(
  cfg: RequestConfig,
  lines: ReturnType<typeof estimateLines>,
): { items: SumItem[]; totalText: string | null } {
  const p = cfg.price;
  const m = (n: number) => money(p.currency, n);
  const pkg = p.mode === "package" && !!p.left && !!p.rates;
  const pl = pkg ? packageLines(lines.map(asExtraIfProperty), p.left) : null;
  const items = lines.map((l, i) => ({
    label: `${l.label}${l.qty > 1 ? ` × ${l.qty}` : ""}`,
    price: !p.rates
      ? undefined
      : pl
        ? packageLineText(pl[i], m)
        : p.mode !== "payg"
          ? p.showAmount && l.amount != null
            ? `~${m(l.amount)}`
            : "Counts toward your package"
          : l.amount == null
            ? "Priced on confirmation"
            : `${l.minimum ? "at least " : ""}${m(l.amount)}`,
  }));
  const total = lines.reduce((n, l) => n + (l.amount ?? 0), 0);
  const extras = (pl ?? []).reduce((n, l) => n + (l.amount ?? 0), 0);
  const totalText =
    !p.rates || !items.length
      ? null
      : pl
        ? extras > 0
          ? `${m(extras)} extra`
          : "Included"
        : p.mode === "payg"
          ? total
            ? `${lines.some((l) => l.minimum) ? "from " : ""}${m(total)}`
            : "On confirmation"
          : p.showAmount && total
            ? `~${m(total)}`
            : null;
  return { items, totalText };
}

/** A photo shoot is billed as an extra even on a package (owner, 17 Oct 2026). */
const asExtraIfProperty = <L extends { key?: string }>(l: L): L =>
  l.key === "shoot" ? { ...l, key: undefined } : l;

/**
 * The booking's live summary (14 Oct 2026): a bar in the modal footer, left of Back / Next
 * ("Summary · Estimated AED X ▾"); tapping it expands a panel upward listing the items (it
 * scrolls when long).
 */
function SummaryBar({ items, totalText }: { items: SumItem[]; totalText: string | null }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="pt-sumbar" data-open={open ? "" : undefined}>
      {open && (
        <div className="pt-sumbar-panel" id="pt-sum-body" aria-label="Summary" role="region">
          <span className="pt-eb">Summary</span>
          {items.length ? (
            <ul className="pt-sum-list">
              {items.map((it, i) => (
                <li key={i}>
                  <span>{it.label}</span>
                  {it.price && <span className="pt-mono">{it.price}</span>}
                </li>
              ))}
            </ul>
          ) : (
            <p className="pt-sum-empty">Choose what you need and it adds up here.</p>
          )}
          {totalText && (
            <div className="pt-sum-total">
              <span>Estimated total</span>
              <b>{totalText}</b>
            </div>
          )}
        </div>
      )}
      <button
        type="button"
        className="pt-sumbar-toggle"
        aria-expanded={open}
        aria-controls="pt-sum-body"
        onClick={() => setOpen((o) => !o)}
      >
        <span className="pt-sumbar-k">Summary</span>
        <span className="pt-sumbar-v">
          {totalText ? (
            <>
              Estimated <b>{totalText}</b>
            </>
          ) : items.length ? (
            `${items.length} item${items.length > 1 ? "s" : ""}`
          ) : (
            "Nothing yet"
          )}
          <span className="pt-sum-chev" aria-hidden="true" />
        </span>
      </button>
    </div>
  );
}

/** A package inclusion with something left this month (package clients with price access). */
function inclusion(cfg: RequestConfig, key: string) {
  if (cfg.price.mode !== "package" || !cfg.price.rates) return null;
  const l = cfg.price.left?.[key];
  return l ? { qty: Number(l.qty), remaining: Math.max(0, Number(l.remaining)) } : null;
}
const includedText = (i: { qty: number; remaining: number }) =>
  `Included in your package · ${i.remaining} of ${i.qty} left this month`;

const rateText = (cfg: RequestConfig, key: string, per: string) => {
  const r = cfg.price.rates?.[key];
  return r == null ? null : `${money(cfg.price.currency, Number(r))} ${per}`;
};

/** A card's price line, from this client's price list (price access only). */
function cardPrice(k: Kind, cfg: RequestConfig): string | null {
  if (!cfg.price.rates) return null;
  if (k === "property") {
    const from = Math.min(
      ...cfg.pricing.apartment.sizes.map((z) => z.photo),
      ...cfg.pricing.villa.sizes.map((z) => z.photo),
    );
    return Number.isFinite(from)
      ? `Photos from ${money(cfg.price.currency, from)} · priced by size`
      : null;
  }
  const inc = inclusion(cfg, KEY.short);
  if (inc) return includedText(inc);
  return rateText(cfg, KEY.short, "per short-form video");
}

/** Under a counter: the price, or what's left on a package and any extras at their own rate. */
function qtyNote(key: string, qty: number, cfg: RequestConfig, per: string): string | null {
  const inc = inclusion(cfg, key);
  if (!inc) return rateText(cfg, key, per);
  const extra = Math.max(0, qty - inc.remaining);
  if (!extra) return includedText(inc);
  const unit = cfg.price.rates?.[key];
  const amount = unit == null ? "" : ` (${money(cfg.price.currency, Number(unit) * extra)})`;
  return `${includedText(inc)} · ${extra} extra at your rate${amount}`;
}

/** By time: what the day costs, by who's looking. */
function dayNote(v: VideoPlan, cfg: RequestConfig): string | null {
  const r = cfg.price.rates;
  if (!r) return null;
  const day = v.day === "full" ? "full" : "half";
  const m = (key: string) =>
    r[key] == null ? "on request" : money(cfg.price.currency, Number(r[key]));
  if (v.raw) return `Raw files only: ${m(KEY.raw[day])} for the ${DAY_LABEL[day].toLowerCase()}.`;
  if (cfg.price.mode === "package")
    return "Each finished video draws from your package; anything beyond it is an extra at your rate.";
  return `Billed per finished video at your rates, at least ${m(KEY.min[day])} for the ${DAY_LABEL[day].toLowerCase()}.`;
}

const ORDER: Kind[] = ["property", "videos"];
const VIDEO0: VideoPlan = { by: "count", short: 4, long: 0, extra_min: 0, day: "half" };

/** Wizard steps joined by a rail: done = filled with a check, current = outlined, next = muted. */
function WizardSteps({ steps, at }: { steps: string[]; at: number }) {
  return (
    <ol className="pt-wiz" aria-label="Steps">
      {steps.map((label, i) => {
        const n = i + 1;
        const state = n < at ? "done" : n === at ? "current" : "next";
        return (
          <li
            key={label}
            data-state={state}
            aria-current={state === "current" ? "step" : undefined}
          >
            <span className="pt-wiz-dot" aria-hidden="true">
              {state === "done" ? <Icon name="check" size={14} /> : n}
            </span>
            <span className="pt-wiz-label">{label}</span>
          </li>
        );
      })}
    </ol>
  );
}

function Stepper({
  id,
  label,
  sub,
  value,
  min = 0,
  max = 100,
  note,
  testId,
  onChange,
}: {
  id: string;
  label: string;
  sub?: string;
  value: number;
  min?: number;
  max?: number;
  note?: string | null;
  testId?: string;
  onChange: (n: number) => void;
}) {
  return (
    <div className="pt-btype-qty" data-testid={testId}>
      <span className="pt-field-label" id={id}>
        {label}
        {sub && <small className="pt-meta"> · {sub}</small>}
      </span>
      <div className="pt-stepper" role="group" aria-labelledby={id}>
        <button
          type="button"
          aria-label={`Fewer: ${label}`}
          onClick={() => onChange(Math.max(min, value - 1))}
        >
          −
        </button>
        <output aria-live="polite">{value}</output>
        <button
          type="button"
          aria-label={`More: ${label}`}
          onClick={() => onChange(Math.min(max, value + 1))}
        >
          +
        </button>
      </div>
      {note && <span className="pt-btype-note pt-mono">{note}</span>}
    </div>
  );
}

type Snap = {
  step: 1 | 2 | 3;
  startTime?: string;
  kinds?: string[];
  video?: VideoPlan;
  prop: PropertyConfig | null;
  date: string;
  slot: Slot | "";
  loc: BookingLocation;
  note: string;
};

/**
 * Book a shoot (owner, 10 Oct 2026; redesigned 18 Oct 2026), a modal on the current page.
 * 1: "What do you need?": Photos (type, size, Twilight and 360 add-ons) and/or Videos (short-form
 * and long-form counters; "Not sure how many?" books a half or full day instead, optionally raw
 * files only). 2: date, slot, preferred start time and the Google Maps location. 3: a summary
 * with the estimate from this client's own rates (shown by who's looking), then Confirm: a
 * Requested shoot in Shoots, Milkywayy is emailed and confirms it. Autosaves as a draft.
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

export function BookingModal({
  cfg,
  resume,
  onClose,
  onBack,
  edit,
}: {
  cfg: RequestConfig;
  resume?: boolean;
  onClose: () => void;
  /** Back from step 1: to "What do you need?". */
  onBack?: () => void;
  /** Edit a Requested shoot, or ask to change a Confirmed one (owner, 10 Oct 2026). */
  edit?: BookingEdit;
}) {
  const { pricing } = cfg;
  // An older booking is read in today's shape (lib/portal/booking normalizeServices).
  const s0 = normalizeServices(edit?.services ?? []);
  const v0 = s0.find((x) => x.service === "videos")?.videos;
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [kinds, setKinds] = useState<Kind[]>(ORDER.filter((k) => s0.some((x) => x.service === k)));
  const [video, setVideo] = useState<VideoPlan>({ ...VIDEO0, ...v0 });
  const [date, setDate] = useState(edit?.date ?? "");
  const [slot, setSlot] = useState<Slot | "">(edit?.slot ?? "");
  const [startTime, setStartTime] = useState(edit?.startTime ?? "");
  const [loc, setLoc] = useState<BookingLocation>(edit?.location ?? { address: "" });
  const [note, setNote] = useState(edit?.note ?? "");
  const [agent, setAgent] = useState(cfg.myContactId ?? "");
  const [touched, setTouched] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const p0 = s0.find((x) => x.service === "property" && x.property)?.property;
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
  const setV = touch((patch: Partial<VideoPlan>) => setVideo((v) => ({ ...v, ...patch })));

  const has = (k: Kind) => kinds.includes(k);
  const videos = cleanVideos(video);
  const noVideos = videos.by === "count" && !videos.short && !videos.long;
  const services: BookingService[] = [
    ...(has("property")
      ? [{ service: "property" as const, property: photosOnly(toConfig(prop)) }]
      : []),
    ...(has("videos") && !noVideos ? [{ service: "videos" as const, videos }] : []),
  ];

  const snap: Snap = {
    step,
    startTime,
    kinds,
    video,
    prop: has("property") ? toConfig(prop) : null,
    date,
    slot,
    loc,
    note,
  };
  // useDraft keeps it in a ref: no memoization needed.
  const restore = (d: Snap) => {
    setStep(d.step ?? 1);
    setStartTime(d.startTime ?? "");
    // Drafts from before the redesign: only the property carries over.
    setKinds(ORDER.filter((k) => (d.kinds ?? []).includes(k)));
    setVideo({ ...VIDEO0, ...(d.video ?? {}) });
    setDate(d.date ?? "");
    setSlot(d.slot ?? "");
    setLoc(d.loc ?? { address: "" });
    setNote(d.note ?? "");
    if (d.prop) dispatchProp({ type: "update", id: 1, patch: { ...d.prop } });
    setTouched(true);
  };
  const draft = useDraft("booking", snap as unknown as Record<string, unknown>, {
    touched: touched && !done,
    resume,
    onRestore: restore as unknown as (d: Record<string, unknown>) => void,
    enabled: !edit,
  });
  const guard = useCloseGuard({
    dirty: touched && !done,
    close: onClose,
    saveNow: draft.saveNow,
    discard: draft.discard,
  });

  const [from, to] = slotHours(slot);
  const form = useFormCheck(() =>
    step === 1
      ? {
          kind: !kinds.length && "Choose Photos, Videos or both.",
          videos:
            has("videos") && noVideos && "Add at least one video, or choose Not sure how many.",
        }
      : step === 2
        ? {
            date: (!date && "Choose a date.") || (date < cfg.today && "Choose a date from today."),
            slot: !SLOTS.some(([k]) => k === slot) && "Choose a slot.",
            start_time:
              !!startTime &&
              (startTime < from || startTime > to) &&
              "Choose a start time inside the slot.",
            location: loc.address.trim().length < 3 && "Add the location.",
          }
        : {},
  );

  // Always worked out (labels for the summary); amounts are shown only with price access.
  const lines = estimateLines(services, cfg.price.rates ?? {}, pricing);
  const total = cfg.price.rates ? lines.reduce((n, l) => n + (l.amount ?? 0), 0) : null;
  const sum = summarize(cfg, lines);

  function toggle(k: Kind) {
    setKinds((ks) =>
      ks.includes(k) ? ks.filter((x) => x !== k) : ORDER.filter((x) => x === k || ks.includes(x)),
    );
  }
  /** By time, the day is the slot length: a full day books the Full day slot. */
  function chooseDay(d: "half" | "full") {
    setV({ day: d });
    if (d === "full") setSlot("full_day");
    else if (slot === "full_day") setSlot("");
  }
  function chooseSlot(k: Slot) {
    setSlot(k);
    const [a, b] = slotHours(k);
    if (startTime && (startTime < a || startTime > b)) setStartTime("");
    if (has("videos") && video.by === "time")
      setVideo((v) => ({ ...v, day: k === "full_day" ? "full" : "half" }));
  }
  function next() {
    if (!form.check()) return;
    form.reset();
    setStep((s) => (s === 1 ? 2 : 3));
  }
  function confirm() {
    if (!services.length) return;
    const b = {
      date,
      slot: slot as Slot,
      startTime: startTime || undefined,
      location: loc,
      services,
      note,
    };
    start(async () => {
      const r = edit ? await updateBooking(edit.projectId, b) : await bookShoot({ ...b, agent });
      if (!r.ok) return form.fail(r.error ?? "Couldn’t send the booking. Try again.");
      setDone(edit ? edit.ref : r.ref!);
    });
  }

  const whatRows = services.map((x) => ({
    key: x.service,
    label: SERVICE_LABEL[x.service],
    text: serviceSummary(x, pricing),
  }));
  const whenText = `${dateLabel(date, { weekday: "short", year: undefined })} · ${SLOTS.find(([k]) => k === slot)?.[1] ?? ""}`;

  if (done)
    return (
      <Modal
        title={edit ? "Shoot details" : "Book a shoot"}
        onClose={onClose}
        testId="booking-modal"
        footer={
          <>
            <button type="button" className="btn btn-g btn-s" onClick={onClose}>
              Done
            </button>
            <Link
              href={`/portal/shoots/${encodeURIComponent(done)}`}
              className="btn btn-p btn-s"
              onClick={onClose}
            >
              View in Shoots
            </Link>
          </>
        }
      >
        <div className="pt-done" role="status">
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
            {edit?.status === "confirmed"
              ? "We’ll look at the change and confirm the shoot again by email."
              : "We’ll confirm your slot shortly by email."}
          </p>
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
              <b>
                {whenText}
                {startTime ? ` · from ${startTime}` : ""}
              </b>
            </li>
            <li>
              <span>Location</span>
              <b>
                {loc.address}
                {loc.unit ? ` · ${loc.unit}` : ""}
              </b>
            </li>
          </ul>
        </div>
      </Modal>
    );

  const head = (k: Kind, ta: string) => (
    <div className="pt-btype-h">
      <span className="pt-eb">{SERVICE_LABEL[k]}</span>
      {ta && <span className="pt-meta">Turnaround: {ta}</span>}
    </div>
  );
  const photosBlock = (
    <section
      key="property"
      className="pt-btype"
      data-field="property"
      aria-label={SERVICE_LABEL.property}
      onClickCapture={() => setTouched(true)}
    >
      {/* Delivery shows on the photography line and each add-on. */}
      {head("property", "")}
      <PropertyOptions p={prop} pricing={pricing} dispatch={dispatchProp} />
    </section>
  );
  const day = video.day === "full" ? "full" : "half";
  const videosBlock = (
    <section
      key="videos"
      className={`pt-btype ${form.errors.videos ? "is-bad" : ""}`}
      data-field="videos"
      aria-label={SERVICE_LABEL.videos}
      data-testid="videos-card"
    >
      {head(
        "videos",
        video.by === "time" && video.raw
          ? ""
          : [
              cfg.turnaround.reels && `short-form ${cfg.turnaround.reels}`,
              cfg.turnaround.long_form && `long-form ${cfg.turnaround.long_form}`,
            ]
              .filter(Boolean)
              .join(" · "),
      )}
      {video.by === "count" ? (
        <>
          <Stepper
            id="qty-short"
            label={VIDEO_LABEL.short.title}
            sub={VIDEO_LABEL.short.sub}
            value={video.short ?? 0}
            testId="qty-short"
            note={qtyNote(KEY.short, video.short ?? 0, cfg, "each")}
            onChange={(n) => setV({ short: n })}
          />
          <Stepper
            id="qty-long"
            label={VIDEO_LABEL.long.title}
            sub={VIDEO_LABEL.long.sub}
            value={video.long ?? 0}
            testId="qty-long"
            note={qtyNote(KEY.long, video.long ?? 0, cfg, "each")}
            onChange={(n) => setV({ long: n })}
          />
          {(video.long ?? 0) > 0 && (
            <Stepper
              id="qty-extra"
              label="Extra minutes"
              sub="Longer than 5 min? All long-form together"
              value={video.extra_min ?? 0}
              max={600}
              testId="qty-extra"
              note={rateText(cfg, KEY.extra, "per extra minute")}
              onChange={(n) => setV({ extra_min: n })}
            />
          )}
          {form.errors.videos && (
            <span className="pt-field-msg" role="alert">
              {form.errors.videos}
            </span>
          )}
          <button
            type="button"
            className="pt-link-btn pt-meta"
            data-testid="by-time"
            onClick={() => {
              setV({ by: "time", day: slot === "full_day" ? "full" : "half" });
            }}
          >
            Not sure how many? Book a half or full day instead
          </button>
        </>
      ) : (
        <>
          <Field name="day" label="How long" required group>
            <div className="pt-seg pt-seg-full" role="group" aria-label="How long">
              {(["half", "full"] as const).map((d) => (
                <button key={d} type="button" aria-pressed={day === d} onClick={() => chooseDay(d)}>
                  {DAY_LABEL[d]}
                </button>
              ))}
            </div>
          </Field>
          <label className="pt-field">
            Roughly how many? (optional)
            <input
              value={video.approx ?? ""}
              maxLength={300}
              placeholder="About 4 reels and a walkthrough"
              onChange={(e) => setV({ approx: e.target.value })}
            />
          </label>
          <label className="pt-check">
            <input
              type="checkbox"
              checked={!!video.raw}
              data-testid="raw-only"
              onChange={(e) => setV({ raw: e.target.checked })}
            />
            Raw files only (no editing)
          </label>
          {dayNote(video, cfg) && (
            <span className="pt-btype-note pt-mono" data-testid="day-note">
              {dayNote(video, cfg)}
            </span>
          )}
          <button
            type="button"
            className="pt-link-btn pt-meta"
            onClick={() => setV({ by: "count", raw: false })}
          >
            Know how many? Count the videos instead
          </button>
        </>
      )}
    </section>
  );

  return (
    <Modal
      title={
        edit ? (edit.status === "confirmed" ? "Request a change" : "Edit details") : "Book a shoot"
      }
      onClose={guard.request}
      testId="booking-modal"
      footer={
        <>
          <SummaryBar items={sum.items} totalText={sum.totalText} />
          <>
            {step === 1 && onBack && (
              <button
                type="button"
                className="btn btn-g btn-s"
                onClick={() => {
                  if (touched) void draft.saveNow();
                  onBack();
                }}
              >
                Back
              </button>
            )}
            {step > 1 && (
              <button
                type="button"
                className="btn btn-g btn-s"
                onClick={() => {
                  form.reset();
                  setStep((s) => (s === 3 ? 2 : 1));
                }}
              >
                Back
              </button>
            )}
            {step < 3 ? (
              <button type="button" className="btn btn-p btn-s" onClick={next}>
                Next
              </button>
            ) : (
              <button
                type="button"
                className="btn btn-p btn-s"
                disabled={pending}
                onClick={confirm}
              >
                {pending
                  ? "Sending…"
                  : edit?.status === "confirmed"
                    ? "Send change request"
                    : edit
                      ? "Save changes"
                      : "Confirm booking"}
              </button>
            )}
          </>
        </>
      }
    >
      <div className="pt-form">
        <DraftOffer
          offer={draft.offer}
          onContinue={draft.continueOffer}
          onFresh={draft.startFresh}
        />
        <WizardSteps steps={["What you need", "When and where", "Summary"]} at={step} />
        <FormBanner text={form.banner} />

        {step === 1 && (
          <div className="pt-book1">
            <div className="pt-book1-main">
              <Field
                name="kind"
                label="What do you need?"
                required
                group
                hint="Choose one or both."
                error={form.errors.kind}
              >
                <div
                  className="pt-choice pt-choice-multi"
                  role="group"
                  aria-label="What do you need?"
                >
                  {ORDER.map((k) => {
                    const price = cardPrice(k, cfg);
                    return (
                      <button
                        key={k}
                        type="button"
                        aria-pressed={has(k)}
                        onClick={touch(() => toggle(k))}
                      >
                        <span className="pt-choice-tick" aria-hidden="true">
                          <Icon name="check" size={14} />
                        </span>
                        {SERVICE_LABEL[k]}
                        <small>{SERVICE_HINT[k]}</small>
                        {price && <small className="pt-choice-price pt-mono">{price}</small>}
                      </button>
                    );
                  })}
                </div>
              </Field>
              {has("property") && photosBlock}
              {has("videos") && videosBlock}
            </div>
          </div>
        )}

        {step === 2 && (
          <>
            <div className="pt-when">
              <Field name="date" label="Date" required group error={form.errors.date}>
                <DatePicker
                  value={date}
                  min={cfg.today}
                  invalid={!!form.errors.date}
                  onChange={touch((v: string) => setDate(v))}
                />
              </Field>
              <Field name="slot" label="Slot" required group error={form.errors.slot}>
                <div className="pt-seg pt-seg-full pt-seg-line" role="group" aria-label="Slot">
                  {SLOTS.map(([k, label]) => (
                    <button
                      key={k}
                      type="button"
                      aria-pressed={slot === k}
                      onClick={touch(() => chooseSlot(k))}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </Field>
              <Field
                name="start_time"
                label="Preferred start time (optional)"
                group
                error={form.errors.start_time}
                hint="We’ll confirm the exact time."
              >
                <TimeWheel
                  value={startTime}
                  from={from}
                  to={to}
                  onChange={touch((v: string) => setStartTime(v))}
                />
              </Field>
            </div>
            <PlacesField
              value={loc}
              onChange={touch((v: BookingLocation) => setLoc(v))}
              error={form.errors.location}
            />
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
          </>
        )}

        {step === 3 && services.length > 0 && (
          <>
            <ul className="pt-summary" aria-label="Summary">
              {whatRows.map((w) => (
                <li key={w.key}>
                  <span>{w.label}</span>
                  <b>{w.text}</b>
                </li>
              ))}
              <li>
                <span>When</span>
                <b>
                  {whenText}
                  {startTime ? ` · preferred start ${startTime}` : ""}
                </b>
              </li>
              <li>
                <span>Where</span>
                <b>
                  {loc.address}
                  {loc.unit ? ` · ${loc.unit}` : ""}
                </b>
              </li>
              {loc.access && (
                <li>
                  <span>Access</span>
                  <span>{loc.access}</span>
                </li>
              )}
            </ul>
            <PriceBlock cfg={cfg} lines={lines} total={total} />
            <p className="pt-meta" style={{ margin: 0 }}>
              No payment now. We confirm the date and time, then it’s in Shoots.
            </p>
          </>
        )}
      </div>
      {guard.dialog}
    </Modal>
  );
}
