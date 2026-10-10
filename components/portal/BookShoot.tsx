"use client";

import { useRouter } from "next/navigation";
import { useReducer, useState, useTransition } from "react";
import { PropertyOptions } from "@/components/booking/BookingBuilder";
import type { PropertyPricing } from "@/content/types";
import { blankProperty, reducer, type Action, type BookingProperty } from "@/lib/booking";
import { bookShoot } from "@/lib/portal/book-actions";
import {
  estimate,
  SERVICE_LABEL,
  serviceSummary,
  SLOTS,
  type BookingLocation,
  type BookingService,
  type PropertyConfig,
  type Rates,
  type Slot,
} from "@/lib/portal/booking";
import { money } from "@/lib/portal/billing";
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

/** One open service panel: its draft values. */
type Panel = { at: number | null; service: Kind; qty: string; notes: string; links: string };

/**
 * Book a shoot (owner, 10 Oct 2026). Step 1: date, time slot and location. Step 2: services, one
 * at a time: pick one, fill in its panel, press Done and it folds into a one-line chip you can
 * edit; then "Add another service". The live estimate uses the client's own rates (and the
 * property price list); it only shows to those who see money.
 */
export function BookShoot({
  pricing,
  rates,
  currency,
  today,
}: {
  pricing: PropertyPricing;
  rates: Rates | null;
  currency: string;
  today: string;
}) {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2>(1);
  const [date, setDate] = useState("");
  const [slot, setSlot] = useState<Slot | "">("");
  const [loc, setLoc] = useState<BookingLocation>({ address: "" });
  const [services, setServices] = useState<BookingService[]>([]);
  const [panel, setPanel] = useState<Panel | null>(null);
  const [picking, setPicking] = useState(true);
  const [note, setNote] = useState("");
  const [err, setErr] = useState("");
  const [pending, start] = useTransition();
  const [prop, dispatchProp] = useReducer(
    (p: BookingProperty, a: Action) =>
      reducer(pricing)({ properties: [p], nextId: 2 }, a).properties[0],
    blankProperty(1, pricing, "", ""),
  );

  const est = rates ? estimate(services, rates, pricing) : null;
  const step1Ok = !!date && !!slot && loc.address.trim().length >= 3;

  function open(service: Kind, at: number | null = null) {
    const s = at != null ? services[at] : null;
    setPanel({
      at,
      service,
      qty: String(s?.qty ?? 1),
      notes: s?.notes ?? "",
      links: (s?.links ?? []).join("\n"),
    });
    if (service === "property" && s?.property)
      dispatchProp({ type: "update", id: 1, patch: { ...s.property } });
    else if (service === "property" && at == null)
      dispatchProp({ type: "update", id: 1, patch: { ...blankProperty(1, pricing, "", "") } });
    setPicking(false);
  }

  function done() {
    if (!panel) return;
    const links = panel.links
      .split(/\s+/)
      .map((l) => l.trim())
      .filter(Boolean);
    if (links.some((l) => !/^https:\/\/\S+$/.test(l)))
      return setErr("Reference links must start with https://");
    if (panel.service !== "property" && !(Number(panel.qty) >= 1 && Number(panel.qty) <= 100))
      return setErr("Quantity between 1 and 100.");
    if (panel.service === "property" && !prop.photo && !prop.video && !prop.tour)
      return setErr("Choose at least one service for the property.");
    setErr("");
    const s: BookingService = {
      service: panel.service,
      ...(panel.service === "property"
        ? { property: toConfig(prop) }
        : { qty: Math.round(Number(panel.qty)) }),
      ...(panel.notes.trim() ? { notes: panel.notes.trim() } : {}),
      ...(links.length ? { links } : {}),
    };
    setServices((list) =>
      panel.at != null ? list.map((x, i) => (i === panel.at ? s : x)) : [...list, s],
    );
    setPanel(null);
  }

  function submit() {
    if (panel) return setErr("Press Done on the open service first.");
    if (!services.length) return setErr("Add at least one service.");
    setErr("");
    start(async () => {
      const r = await bookShoot({ date, slot: slot as Slot, location: loc, services, note });
      if (!r.ok) return setErr(r.error ?? "Couldn’t send the booking.");
      router.push(`/portal/shoots/${encodeURIComponent(r.ref!)}?booked=1`);
    });
  }

  return (
    <div className="pt-book" data-testid="book-shoot">
      <ol className="pt-book-steps" aria-label="Steps">
        <li aria-current={step === 1 ? "step" : undefined}>1 · When and where</li>
        <li aria-current={step === 2 ? "step" : undefined}>2 · What we shoot</li>
      </ol>

      {step === 1 ? (
        <section className="pt-card pt-form" aria-label="When and where">
          <div className="pt-grid2">
            <label className="pt-field">
              Date
              <input
                type="date"
                min={today}
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </label>
            <fieldset className="pt-field" style={{ border: 0, padding: 0, margin: 0 }}>
              <legend>Time slot</legend>
              <div className="pt-seg" role="group" aria-label="Time slot">
                {SLOTS.map(([k, label]) => (
                  <button
                    key={k}
                    type="button"
                    aria-pressed={slot === k}
                    onClick={() => setSlot(k)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </fieldset>
          </div>
          <PlacesField value={loc} onChange={setLoc} />
          {err && (
            <p className="pt-error" role="alert">
              {err}
            </p>
          )}
          <div className="pt-btns">
            <button
              type="button"
              className="btn btn-p btn-s"
              onClick={() => {
                if (!step1Ok) return setErr("Choose the date, a time slot and the location.");
                setErr("");
                setStep(2);
              }}
            >
              Continue
            </button>
          </div>
        </section>
      ) : (
        <section className="pt-card pt-form" aria-label="What we shoot">
          <p className="pt-meta" style={{ margin: 0 }}>
            {date} · {SLOTS.find(([k]) => k === slot)?.[1]} · {loc.address}{" "}
            <button type="button" className="pt-link-btn" onClick={() => setStep(1)}>
              Change
            </button>
          </p>

          {services.length > 0 && (
            <ul className="pt-svc-chips" aria-label="Services added">
              {services.map((s, i) => (
                <li key={i} className="pt-svc-chip" data-testid="service-chip">
                  <span>
                    <b>{SERVICE_LABEL[s.service]}</b> · {serviceSummary(s, pricing)}
                  </span>
                  <span className="pt-btns">
                    <button
                      type="button"
                      className="pt-link-btn"
                      disabled={!!panel}
                      onClick={() => open(s.service, i)}
                      aria-label={`Edit ${SERVICE_LABEL[s.service]}`}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="pt-link-btn"
                      disabled={!!panel}
                      onClick={() => setServices((l) => l.filter((_, j) => j !== i))}
                      aria-label={`Remove ${SERVICE_LABEL[s.service]}`}
                    >
                      Remove
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          )}

          {panel ? (
            <div
              className="pt-svc-panel"
              data-testid="service-panel"
              aria-label={SERVICE_LABEL[panel.service]}
              role="group"
            >
              <b>{SERVICE_LABEL[panel.service]}</b>
              {panel.service === "property" ? (
                <div className="pt-book-prop">
                  <PropertyOptions p={prop} pricing={pricing} dispatch={dispatchProp} />
                </div>
              ) : (
                <label className="pt-field">
                  Roughly how many?
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={panel.qty}
                    onChange={(e) => setPanel({ ...panel, qty: e.target.value })}
                  />
                </label>
              )}
              <label className="pt-field">
                Notes (optional)
                <textarea
                  rows={3}
                  maxLength={1000}
                  value={panel.notes}
                  placeholder="What you have in mind: style, music, people, rooms…"
                  onChange={(e) => setPanel({ ...panel, notes: e.target.value })}
                />
              </label>
              <label className="pt-field">
                Reference links (optional, one per line)
                <textarea
                  rows={2}
                  value={panel.links}
                  placeholder="https://www.instagram.com/reel/…"
                  onChange={(e) => setPanel({ ...panel, links: e.target.value })}
                />
              </label>
              <div className="pt-btns">
                <button type="button" className="btn btn-p btn-s" onClick={done}>
                  Done
                </button>
                <button
                  type="button"
                  className="btn btn-g btn-s"
                  onClick={() => {
                    setPanel(null);
                    setErr("");
                    if (!services.length) setPicking(true);
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : picking || !services.length ? (
            <div className="pt-choice two" role="group" aria-label="Choose a service">
              {(["reels", "long_form", "property"] as Kind[]).map((k) => (
                <button key={k} type="button" onClick={() => open(k)}>
                  {SERVICE_LABEL[k]}
                  <small>
                    {k === "reels"
                      ? "Vertical edits for Instagram, TikTok and Shorts"
                      : k === "long_form"
                        ? "Walkthroughs, launches, explainers"
                        : "Photos, video, 360 tour, twilight"}
                  </small>
                </button>
              ))}
            </div>
          ) : (
            <button
              type="button"
              className="btn btn-g btn-s"
              onClick={() => setPicking(true)}
              style={{ justifySelf: "start" }}
            >
              + Add another service
            </button>
          )}

          {est != null && services.length > 0 && (
            <p className="pt-estimate" data-testid="estimate">
              Estimated ~{money(currency, est)}. The final amount is set after the shoot.
            </p>
          )}

          <label className="pt-field">
            Anything else we should know? (optional)
            <textarea
              rows={2}
              maxLength={2000}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </label>
          {err && (
            <p className="pt-error" role="alert">
              {err}
            </p>
          )}
          <div className="pt-btns">
            <button type="button" className="btn btn-p btn-s" disabled={pending} onClick={submit}>
              {pending ? "Sending…" : "Request the shoot"}
            </button>
          </div>
          <p className="pt-meta" style={{ margin: 0 }}>
            We confirm the date and slot, usually within the hour during working hours.
          </p>
        </section>
      )}
    </div>
  );
}
