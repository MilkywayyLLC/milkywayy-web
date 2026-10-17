"use client";

import Link from "next/link";
import { useCallback, useReducer, useState, useTransition } from "react";
import { PropertyOptions } from "@/components/booking/PropertyOptions";
import { blankProperty, reducer, type Action, type BookingProperty } from "@/lib/booking";
import { bookShoot, updateBooking } from "@/lib/portal/book-actions";
import { dateLabel, money } from "@/lib/portal/billing";
import {
  DAY_LABEL,
  estimateLines,
  isRaw,
  MODE_LABEL,
  packageLines,
  packageLineText,
  rawDay,
  SERVICE_HINT,
  SERVICE_LABEL,
  serviceSummary,
  slotHours,
  SLOTS,
  type BookingLocation,
  type BookingService,
  type PropertyConfig,
  type ShootMode,
  type Slot,
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

type Kind = BookingService["service"];
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
  lines?: { key?: string; label: string; qty: number; amount: number | null }[];
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
                {l.amount == null ? "Priced on confirmation" : money(p.currency, l.amount)}
              </span>
            </li>
          ))}
        </ul>
      )}
      <b>
        Estimated {total ? money(p.currency, total) : "on confirmation"}. The final amount is set
        after the shoot.
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
            : m(l.amount),
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
            ? m(total)
            : "On confirmation"
          : p.showAmount && total
            ? `~${m(total)}`
            : null;
  return { items, totalText };
}

/** A property shoot is billed as an extra even on a package (owner, 17 Oct 2026). */
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

const RATE_KEY = { reels: "reel_shoot", long_form: "long_form_shoot" } as const;
type VideoKind = keyof typeof RATE_KEY;

/** A package inclusion with something left this month (package clients with price access). */
function inclusion(cfg: RequestConfig, key: string) {
  if (cfg.price.mode !== "package" || !cfg.price.rates) return null;
  const l = cfg.price.left?.[key];
  return l ? { qty: Number(l.qty), remaining: Math.max(0, Number(l.remaining)) } : null;
}
const includedText = (i: { qty: number; remaining: number }) =>
  `Included in your package · ${i.remaining} of ${i.qty} left this month`;

/** A shoot type's price on its card, from this client's price list (price access only). */
function cardPrice(k: Kind, mode: ShootMode, cfg: RequestConfig): string | null {
  const r = cfg.price.rates;
  if (!r || mode === "raw") return null;
  const m = (n: number | null | undefined) =>
    n == null ? null : money(cfg.price.currency, Number(n));
  if (k === "property") {
    const from = Math.min(
      ...cfg.pricing.apartment.sizes.map((z) => z.photo),
      ...cfg.pricing.villa.sizes.map((z) => z.photo),
    );
    return Number.isFinite(from) ? `Photos from ${m(from)} · priced by size` : null;
  }
  const inc = inclusion(cfg, RATE_KEY[k]);
  if (inc) return includedText(inc);
  const per = m(r[RATE_KEY[k]]);
  return per ? `${per} per ${k === "reels" ? "reel" : "video"}` : null;
}

/** Package clients, under the quantity: what's left, and any extras at their own rate. */
function qtyNote(k: VideoKind, qty: number, cfg: RequestConfig): string | null {
  const inc = inclusion(cfg, RATE_KEY[k]);
  if (!inc) return null;
  const extra = Math.max(0, qty - inc.remaining);
  if (!extra) return includedText(inc);
  const unit = cfg.price.rates?.[RATE_KEY[k]];
  const amount = unit == null ? "" : ` (${money(cfg.price.currency, Number(unit) * extra)})`;
  return `${includedText(inc)} · ${extra} extra at your rate${amount}`;
}

/** Shoot only: the slot rate (half day / full day), or what's left of it on a package. */
function slotRateText(cfg: RequestConfig): string | null {
  const r = cfg.price.rates;
  if (!r) return null;
  const one = (key: "half_day" | "full_day") => {
    const inc = inclusion(cfg, key);
    if (inc?.remaining) return `included (${inc.remaining} of ${inc.qty} left)`;
    return r[key] == null ? "on request" : money(cfg.price.currency, Number(r[key]));
  };
  return `One slot rate per booking: half day ${one("half_day")} · full day ${one("full_day")}`;
}

const MODE_HINT: Record<ShootMode, string> = {
  edited: "We film and edit. You get finished photos and videos, ready to post.",
  raw: "We film, you edit. You get the raw files, for one slot rate per booking.",
};
const ORDER: Kind[] = ["property", "reels", "long_form"];
const QTY0 = { reels: 4, long_form: 2 } as const;

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

type Snap = {
  step: 1 | 2 | 3;
  mode?: ShootMode;
  startTime?: string;
  kinds?: Kind[];
  reelsQty?: number;
  longQty?: number;
  /** Older drafts: one type and one shared quantity. */
  kind?: Kind | "";
  qty?: number;
  prop: PropertyConfig | null;
  day: "half" | "full" | "";
  date: string;
  slot: Slot | "";
  loc: BookingLocation;
  note: string;
};

/**
 * Book a shoot (owner, 10 Oct 2026), a modal on the current page. 1: the shoot types (any of
 * property, reels and long-form; owner, 17 Oct 2026), each with its own details. 2: date, slot,
 * preferred start time and the Google Maps location. 3: a summary with the estimate from this
 * client's own rates (shown by who's looking), then Confirm: a Requested shoot in Shoots,
 * Milkywayy is emailed and confirms it. Autosaves as a draft.
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

const qtyOf = (list: BookingService[] | undefined, k: VideoKind) =>
  list?.find((x) => x.service === k && !isRaw(x))?.qty ?? QTY0[k];

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
  const s0 = edit?.services ?? [];
  const raw0 = s0.some(isRaw);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [mode, setMode] = useState<ShootMode>(raw0 ? "raw" : "edited");
  // Property shoots are always shot & edited: an older shoot-only property isn't carried over.
  const [kinds, setKinds] = useState<Kind[]>(
    ORDER.filter((k) => s0.some((x) => x.service === k && !(raw0 && k === "property"))),
  );
  const [reelsQty, setReelsQty] = useState(qtyOf(s0, "reels"));
  const [longQty, setLongQty] = useState(qtyOf(s0, "long_form"));
  const [day, setDay] = useState<"half" | "full" | "">(rawDay(s0) ?? "");
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

  const has = (k: Kind) => kinds.includes(k);
  const services: BookingService[] = ORDER.filter(has).flatMap((k): BookingService[] => {
    if (k === "property")
      return mode === "raw" ? [] : [{ service: "property", mode, property: toConfig(prop) }];
    return mode === "raw"
      ? [{ service: k, mode, day: day || "half" }]
      : [{ service: k, mode, qty: k === "reels" ? reelsQty : longQty }];
  });

  const snap: Snap = {
    step,
    mode,
    startTime,
    kinds,
    reelsQty,
    longQty,
    prop: has("property") && mode === "edited" ? toConfig(prop) : null,
    day,
    date,
    slot,
    loc,
    note,
  };
  const restore = useCallback((d: Snap) => {
    const m = d.mode === "raw" ? "raw" : "edited";
    const ks = d.kinds ?? (d.kind ? [d.kind] : []);
    setStep(d.step ?? 1);
    setMode(m);
    setStartTime(d.startTime ?? "");
    setKinds(ORDER.filter((k) => ks.includes(k) && !(m === "raw" && k === "property")));
    setReelsQty(d.reelsQty ?? (d.kind === "reels" && d.qty ? d.qty : QTY0.reels));
    setLongQty(d.longQty ?? (d.kind === "long_form" && d.qty ? d.qty : QTY0.long_form));
    setDay(d.day ?? "");
    setDate(d.date ?? "");
    setSlot(d.slot ?? "");
    setLoc(d.loc ?? { address: "" });
    setNote(d.note ?? "");
    if (d.prop) dispatchProp({ type: "update", id: 1, patch: { ...d.prop } });
    setTouched(true);
  }, []);
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
          kind: !services.length && "Choose at least one type of shoot.",
          property:
            has("property") &&
            mode === "edited" &&
            !prop.photo &&
            !prop.video &&
            !prop.tour &&
            "Choose at least one: photos, videography or 360 tour.",
          day: mode === "raw" && services.length > 0 && !day && "Choose half day or full day.",
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
    if (mode === "raw" && !day) setDay(slot === "full_day" ? "full" : "half");
  }
  function chooseMode(m: ShootMode) {
    setMode(m);
    if (m === "raw") {
      setKinds((ks) => ks.filter((k) => k !== "property"));
      if (!day) setDay(slot === "full_day" ? "full" : "half");
    }
  }
  function chooseSlot(k: Slot) {
    setSlot(k);
    const [a, b] = slotHours(k);
    if (startTime && (startTime < a || startTime > b)) setStartTime("");
    // Shoot only: the slot is the shoot length.
    if (mode === "raw" && services.length) setDay(k === "full_day" ? "full" : "half");
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

  const taOf = (k: Kind) =>
    k === "property"
      ? cfg.turnaround.property_shoot
      : k === "reels"
        ? cfg.turnaround.reels
        : cfg.turnaround.long_form;
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
            <li>
              <span>Delivery</span>
              <b>{MODE_LABEL[mode]}</b>
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

  const typeBlock = (k: Kind) => {
    // Turnarounds are for edited work; shoot only is the raw files after the slot.
    const ta = mode === "edited" ? taOf(k) : "";
    const head = (
      <div className="pt-btype-h">
        <span className="pt-eb">{SERVICE_LABEL[k]}</span>
        {ta && <span className="pt-meta">Turnaround: {ta}</span>}
      </div>
    );
    if (k === "property")
      return (
        <section
          key={k}
          className={`pt-btype ${form.errors.property ? "is-bad" : ""}`}
          data-field="property"
          aria-label={SERVICE_LABEL[k]}
          onClickCapture={() => setTouched(true)}
        >
          {head}
          <PropertyOptions
            p={prop}
            pricing={pricing}
            dispatch={dispatchProp}
            errors={form.errors.property ? { services: form.errors.property } : undefined}
          />
        </section>
      );
    const qty = k === "reels" ? reelsQty : longQty;
    const setQty = k === "reels" ? setReelsQty : setLongQty;
    const note = qtyNote(k, qty, cfg);
    return (
      <section key={k} className="pt-btype" aria-label={SERVICE_LABEL[k]}>
        {head}
        {mode === "edited" ? (
          <div className="pt-btype-qty">
            <span className="pt-field-label" id={`qty-${k}`}>
              {k === "reels" ? "Number of reels" : "Number of videos"}
            </span>
            <div className="pt-stepper" role="group" aria-labelledby={`qty-${k}`}>
              <button
                type="button"
                aria-label="Fewer"
                onClick={touch(() => setQty((n) => Math.max(1, n - 1)))}
              >
                −
              </button>
              <output aria-live="polite">{qty}</output>
              <button
                type="button"
                aria-label="More"
                onClick={touch(() => setQty((n) => Math.min(100, n + 1)))}
              >
                +
              </button>
            </div>
            {note && (
              <span className="pt-btype-note pt-mono" data-testid={`pkg-${k}`}>
                {note}
              </span>
            )}
          </div>
        ) : (
          <p className="pt-meta" style={{ margin: 0 }}>
            {SERVICE_HINT[k]}. We film it in your slot and send the raw files; say how many in the
            notes on the next step.
          </p>
        )}
      </section>
    );
  };

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
        <WizardSteps steps={["Shoot type", "When and where", "Summary"]} at={step} />
        <FormBanner text={form.banner} />

        {step === 1 && (
          <div className="pt-book1">
            <div className="pt-book1-main">
              <div className="pt-modeseg">
                <div className="pt-seg pt-seg-full" role="group" aria-label="What we deliver">
                  {(["edited", "raw"] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      aria-pressed={mode === m}
                      onClick={touch(() => chooseMode(m))}
                    >
                      {MODE_LABEL[m]}
                    </button>
                  ))}
                </div>
                <p className="pt-modeseg-desc" aria-live="polite">
                  {MODE_HINT[mode]}
                </p>
              </div>
              <Field
                name="kind"
                label="Type of shoot"
                required
                group
                hint="Choose one or more."
                error={form.errors.kind}
              >
                <div className="pt-choice pt-choice-multi" role="group" aria-label="Type of shoot">
                  {ORDER.filter((k) => mode === "edited" || k !== "property").map((k) => {
                    const price = cardPrice(k, mode, cfg);
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
              {mode === "raw" && (
                <p className="pt-meta" style={{ margin: 0 }}>
                  Property shoots are always shot and edited: switch to {MODE_LABEL.edited} to add
                  one.
                </p>
              )}
              {ORDER.filter(has).map(typeBlock)}
              {mode === "raw" && services.length > 0 && (
                <Field name="day" label="Shoot length" required group error={form.errors.day}>
                  <div className="pt-seg pt-seg-full" role="group" aria-label="Shoot length">
                    {(["half", "full"] as const).map((d) => (
                      <button
                        key={d}
                        type="button"
                        aria-pressed={day === d}
                        onClick={touch(() => {
                          setDay(d);
                          if (d === "full") setSlot("full_day");
                          else if (slot === "full_day") setSlot("");
                        })}
                      >
                        {DAY_LABEL[d]}
                      </button>
                    ))}
                  </div>
                  {slotRateText(cfg) && (
                    <span className="pt-btype-note pt-mono">{slotRateText(cfg)}</span>
                  )}
                </Field>
              )}
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
                placeholder={
                  mode === "raw"
                    ? "Roughly how many reels or videos, style, people on camera…"
                    : "Style, people on camera, rooms to focus on…"
                }
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
              <li>
                <span>Delivery</span>
                <b>{MODE_LABEL[mode]}</b>
              </li>
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
