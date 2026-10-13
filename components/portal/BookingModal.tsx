"use client";

import Link from "next/link";
import { useCallback, useReducer, useState, useTransition } from "react";
import { PropertyOptions } from "@/components/booking/PropertyOptions";
import {
  blankProperty,
  priceLines,
  reducer,
  type Action,
  type BookingProperty,
} from "@/lib/booking";
import { bookShoot, updateBooking } from "@/lib/portal/book-actions";
import { dateLabel, money } from "@/lib/portal/billing";
import {
  DAY_LABEL,
  estimateLines,
  SERVICE_HINT,
  SERVICE_LABEL,
  serviceSummary,
  SLOTS,
  type BookingLocation,
  type BookingService,
  type PropertyConfig,
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
  lines?: { label: string; qty: number; amount: number | null }[];
  total: number | null;
}) {
  const p = cfg.price;
  if (!p.rates) return null;
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

/**
 * The booking's live summary (14 Oct 2026): a bar in the modal footer, left of Back / Next
 * ("Summary · Estimated AED X ▾"); tapping it expands a panel upward listing the items (it
 * scrolls when long). What it shows follows PriceBlock: no prices without rate access,
 * "Included in package" on a package.
 */
function SummaryBar({
  cfg,
  service,
  prop,
  lines,
  total,
}: {
  cfg: RequestConfig;
  service: BookingService | null;
  /** The property builder's state: listed item by item (the same lines its subtotal adds up). */
  prop: BookingProperty;
  lines: ReturnType<typeof estimateLines>;
  total: number | null;
}) {
  const [open, setOpen] = useState(false);
  const p = cfg.price;
  const raw: { label: string; amount: number | null }[] =
    service?.service === "property"
      ? priceLines(prop, cfg.pricing)
      : lines.map((l) => ({
          label: `${l.label}${l.qty > 1 ? ` × ${l.qty}` : ""}`,
          amount: l.amount,
        }));
  const items: { label: string; price?: string }[] = !service
    ? []
    : p.rates || service.service === "property"
      ? raw.map((l) => ({
          label: l.label,
          price: !p.rates
            ? undefined
            : p.mode !== "payg"
              ? "Included in package"
              : l.amount == null
                ? "Priced on confirmation"
                : money(p.currency, l.amount),
        }))
      : [{ label: `${SERVICE_LABEL[service.service]} · ${serviceSummary(service, cfg.pricing)}` }];
  const totalText =
    !p.rates || !items.length
      ? null
      : p.mode === "payg"
        ? total
          ? money(p.currency, total)
          : "On confirmation"
        : p.showAmount && total
          ? `~${money(p.currency, total)}`
          : null;
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

/** Wizard steps joined by a rail: done = filled with a check, current = outlined, next = muted. */
function WizardSteps({ steps, at }: { steps: string[]; at: number }) {
  return (
    <ol className="pt-wiz" aria-label="Steps">
      {steps.map((label, i) => {
        const n = i + 1;
        const state = n < at ? "done" : n === at ? "current" : "next";
        return (
          <li key={label} data-state={state} aria-current={state === "current" ? "step" : undefined}>
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
  kind: Kind | "";
  prop: PropertyConfig | null;
  qty: number;
  day: "half" | "full" | "";
  date: string;
  slot: Slot | "";
  loc: BookingLocation;
  note: string;
};

/**
 * Book a shoot (owner, 10 Oct 2026), a modal on the current page. 1: the shoot type (property,
 * reels, long-form). 2: date, time preference and the Google Maps location. 3: a summary with the
 * estimate from this client's own rates (shown by who's looking), then Confirm: a Requested shoot
 * in Shoots, Milkywayy is emailed and confirms it. Autosaves as a draft.
 */
export type BookingEdit = {
  projectId: string;
  ref: string;
  status: "requested" | "confirmed";
  date: string;
  slot: Slot | "";
  location: BookingLocation;
  service: BookingService | null;
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
  const s0 = edit?.service;
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [kind, setKind] = useState<Kind | "">(s0?.service ?? "");
  const [qty, setQty] = useState(s0?.qty ?? 4);
  const [day, setDay] = useState<"half" | "full" | "">(s0?.day ?? "");
  const [date, setDate] = useState(edit?.date ?? "");
  const [slot, setSlot] = useState<Slot | "">(edit?.slot ?? "");
  const [loc, setLoc] = useState<BookingLocation>(edit?.location ?? { address: "" });
  const [note, setNote] = useState(edit?.note ?? "");
  const [touched, setTouched] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [prop, dispatchProp] = useReducer(
    (p: BookingProperty, a: Action) =>
      reducer(pricing)({ properties: [p], nextId: 2 }, a).properties[0],
    blankProperty(1, pricing, "", ""),
    (p) => (s0?.property ? { ...p, ...s0.property } : p),
  );
  // Reels and long-form: half day picks morning or afternoon; a full day has no time choice.
  const fullDay = kind !== "" && kind !== "property" && day === "full";
  const touch =
    <A extends unknown[]>(f: (...a: A) => void) =>
    (...a: A) => {
      setTouched(true);
      f(...a);
    };

  const service: BookingService | null =
    kind === "property"
      ? { service: "property", property: toConfig(prop) }
      : kind
        ? { service: kind, qty, ...(day ? { day } : {}) }
        : null;

  const snap: Snap = {
    step,
    kind,
    prop: kind === "property" ? toConfig(prop) : null,
    qty,
    day,
    date,
    slot,
    loc,
    note,
  };
  const restore = useCallback((d: Snap) => {
    setStep(d.step ?? 1);
    setKind(d.kind ?? "");
    setQty(d.qty ?? 4);
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

  const form = useFormCheck(() =>
    step === 1
      ? {
          kind: !kind && "Choose the type of shoot.",
          property:
            kind === "property" &&
            !prop.photo &&
            !prop.video &&
            !prop.tour &&
            "Choose at least one: photos, videography or 360 tour.",
          qty: kind && kind !== "property" && !(qty >= 1 && qty <= 100) && "Between 1 and 100.",
          day: kind && kind !== "property" && !day && "Choose half day or full day.",
        }
      : step === 2
        ? {
            date: (!date && "Choose a date.") || (date < cfg.today && "Choose a date from today."),
            slot: !fullDay && slot !== "morning" && slot !== "afternoon" && "Choose a time.",
            location: loc.address.trim().length < 3 && "Add the location.",
          }
        : {},
  );

  const lines =
    service && cfg.price.rates ? estimateLines([service], cfg.price.rates, pricing) : [];
  const total = lines.length ? lines.reduce((n, l) => n + (l.amount ?? 0), 0) : null;

  function next() {
    if (!form.check()) return;
    form.reset();
    setStep((s) => (s === 1 ? 2 : 3));
  }
  function confirm() {
    if (!service) return;
    const b = {
      date,
      slot: (fullDay ? "full_day" : slot) as Slot,
      location: loc,
      services: [service],
      note,
    };
    start(async () => {
      const r = edit ? await updateBooking(edit.projectId, b) : await bookShoot(b);
      if (!r.ok) return form.fail(r.error ?? "Couldn’t send the booking. Try again.");
      setDone(edit ? edit.ref : r.ref!);
    });
  }

  const ta =
    kind === "property"
      ? cfg.turnaround.property_shoot
      : kind === "reels"
        ? cfg.turnaround.reels
        : kind === "long_form"
          ? cfg.turnaround.long_form
          : "";

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
            {service && (
              <>
                <li>
                  <span>Shoot type</span>
                  <b>{SERVICE_LABEL[service.service]}</b>
                </li>
                <li>
                  <span>{service.service === "property" ? "Property and services" : "Details"}</span>
                  <b>{serviceSummary(service, pricing)}</b>
                </li>
              </>
            )}
            <li>
              <span>Date and slot</span>
              <b>
                {dateLabel(date, { weekday: "short", year: undefined })} ·{" "}
                {fullDay ? "Full day" : SLOTS.find(([k]) => k === slot)?.[1]}
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

  return (
    <Modal
      title={
        edit ? (edit.status === "confirmed" ? "Request a change" : "Edit details") : "Book a shoot"
      }
      onClose={guard.request}
      testId="booking-modal"
      footer={
        <>
          <SummaryBar cfg={cfg} service={service} prop={prop} lines={lines} total={total} />
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
              <Field name="kind" label="Type of shoot" required group error={form.errors.kind}>
                <div className="pt-choice" role="group" aria-label="Type of shoot">
                  {(["property", "reels", "long_form"] as Kind[]).map((k) => (
                    <button
                      key={k}
                      type="button"
                      aria-pressed={kind === k}
                      onClick={touch(() => {
                        setKind(k);
                        if (k !== "property" && !day) setDay("half");
                      })}
                    >
                      {SERVICE_LABEL[k]}
                      <small>{SERVICE_HINT[k]}</small>
                    </button>
                  ))}
                </div>
              </Field>
              {kind === "property" && (
                <div
                  className={`pt-book-prop ${form.errors.property ? "is-bad" : ""}`}
                  data-field="property"
                  onClickCapture={() => setTouched(true)}
                >
                  <PropertyOptions
                    p={prop}
                    pricing={pricing}
                    dispatch={dispatchProp}
                    errors={form.errors.property ? { services: form.errors.property } : undefined}
                  />
                </div>
              )}
              {kind && kind !== "property" && (
                <div className="pt-grid2">
                  <Field
                    name="qty"
                    label={kind === "reels" ? "Number of reels" : "Number of videos"}
                    required
                    group
                    error={form.errors.qty}
                  >
                    <div className="pt-stepper">
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
                  </Field>
                  <Field name="day" label="Shoot length" required group error={form.errors.day}>
                    <div className="pt-seg" role="group" aria-label="Shoot length">
                      {(["half", "full"] as const).map((d) => (
                        <button
                          key={d}
                          type="button"
                          aria-pressed={day === d}
                          onClick={touch(() => {
                            setDay(d);
                            setSlot(d === "full" ? "full_day" : slot === "full_day" ? "" : slot);
                          })}
                        >
                          {DAY_LABEL[d]}
                        </button>
                      ))}
                    </div>
                  </Field>
                </div>
              )}
              {ta && <span className="pt-turnaround">Usual turnaround: {ta}</span>}
            </div>
          </div>
        )}

        {step === 2 && (
          <>
            <div className="pt-grid2">
              <Field name="date" label="Date" required error={form.errors.date}>
                <input
                  type="date"
                  min={cfg.today}
                  value={date}
                  onChange={touch((e: React.ChangeEvent<HTMLInputElement>) =>
                    setDate(e.target.value),
                  )}
                />
              </Field>
              {fullDay ? (
                <div className="pt-field">
                  <span className="pt-field-label">Time</span>
                  <p className="pt-note" style={{ margin: 0 }}>
                    Full day, we’ll confirm the start time.
                  </p>
                </div>
              ) : (
                <Field name="slot" label="Time" required group error={form.errors.slot}>
                  <div className="pt-seg pt-seg-line" role="group" aria-label="Time">
                    {SLOTS.filter(([k]) => k !== "full_day").map(([k, label]) => (
                      <button
                        key={k}
                        type="button"
                        aria-pressed={slot === k}
                        onClick={touch(() => setSlot(k))}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </Field>
              )}
            </div>
            <PlacesField
              value={loc}
              onChange={touch((v: BookingLocation) => setLoc(v))}
              error={form.errors.location}
            />
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

        {step === 3 && service && (
          <>
            <ul className="pt-summary" aria-label="Summary">
              <li>
                <span>What</span>
                <b>
                  {SERVICE_LABEL[service.service]} · {serviceSummary(service, pricing)}
                </b>
              </li>
              <li>
                <span>When</span>
                <b>
                  {dateLabel(date, { weekday: "short", year: undefined })} ·{" "}
                  {fullDay ? "Full day" : SLOTS.find(([k]) => k === slot)?.[1]}
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
            {ta && <span className="pt-turnaround">Usual turnaround: {ta}</span>}
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
