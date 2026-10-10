"use client";

import Link from "next/link";
import { useCallback, useReducer, useState, useTransition } from "react";
import { PropertyOptions } from "@/components/booking/PropertyOptions";
import { blankProperty, reducer, type Action, type BookingProperty } from "@/lib/booking";
import { bookShoot } from "@/lib/portal/book-actions";
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
export function BookingModal({
  cfg,
  resume,
  onClose,
}: {
  cfg: RequestConfig;
  resume?: boolean;
  onClose: () => void;
}) {
  const { pricing } = cfg;
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [kind, setKind] = useState<Kind | "">("");
  const [qty, setQty] = useState(4);
  const [day, setDay] = useState<"half" | "full" | "">("");
  const [date, setDate] = useState("");
  const [slot, setSlot] = useState<Slot | "">("");
  const [loc, setLoc] = useState<BookingLocation>({ address: "" });
  const [note, setNote] = useState("");
  const [touched, setTouched] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [prop, dispatchProp] = useReducer(
    (p: BookingProperty, a: Action) =>
      reducer(pricing)({ properties: [p], nextId: 2 }, a).properties[0],
    blankProperty(1, pricing, "", ""),
  );
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
            slot: !slot && "Choose a time.",
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
    start(async () => {
      const r = await bookShoot({
        date,
        slot: slot as Slot,
        location: loc,
        services: [service],
        note,
      });
      if (!r.ok) return form.fail(r.error ?? "Couldn’t send the booking. Try again.");
      setDone(r.ref!);
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
      <Modal title="Book a shoot" onClose={onClose} testId="booking-modal">
        <div className="pt-form" role="status">
          <span className="pt-eb">{done} · Requested</span>
          <b style={{ fontSize: 20 }}>Booking request sent</b>
          <p style={{ margin: 0 }}>
            We’ll confirm the date and time, usually within the hour during working hours. You’ll
            get an email when it’s confirmed.
          </p>
          <div className="pt-btns">
            <Link
              href={`/portal/shoots/${encodeURIComponent(done)}`}
              className="btn btn-p btn-s"
              onClick={onClose}
            >
              View in Shoots
            </Link>
            <button type="button" className="btn btn-g btn-s" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
      </Modal>
    );

  return (
    <Modal
      title="Book a shoot"
      onClose={guard.request}
      testId="booking-modal"
      footer={
        <>
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
              Continue
            </button>
          ) : (
            <button type="button" className="btn btn-p btn-s" disabled={pending} onClick={confirm}>
              {pending ? "Sending…" : "Confirm booking"}
            </button>
          )}
        </>
      }
    >
      <div className="pt-form">
        <DraftOffer
          offer={draft.offer}
          onContinue={draft.continueOffer}
          onFresh={draft.startFresh}
        />
        <ol className="pt-book-steps" aria-label="Steps">
          <li aria-current={step === 1 ? "step" : undefined}>1 · Shoot type</li>
          <li aria-current={step === 2 ? "step" : undefined}>2 · When and where</li>
          <li aria-current={step === 3 ? "step" : undefined}>3 · Summary</li>
        </ol>
        <FormBanner text={form.banner} />

        {step === 1 && (
          <>
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
                className={`pt-book-prop${form.errors.property ? "is-bad" : ""}`}
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
                          if (d === "full") setSlot("full_day");
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
          </>
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
              <Field name="slot" label="Time preference" required group error={form.errors.slot}>
                <div className="pt-seg" role="group" aria-label="Time preference">
                  {SLOTS.map(([k, label]) => (
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
                  {SLOTS.find(([k]) => k === slot)?.[1]}
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
