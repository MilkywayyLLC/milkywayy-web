"use client";

import { useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import type { PropertyPricing } from "@/content/types";
import {
  EVENING,
  TWILIGHT_QTYS,
  blankProperty,
  buildMessage,
  dateLabel,
  isLocked,
  locationText,
  needsEvening,
  reducer,
  servicePrices,
  servicesText,
  subtotal,
  title,
  total,
  twilightNote,
  twilightTable,
  validate,
  type Action,
  type BookingErrors,
  type BookingProperty,
  type BookingState,
  type Toggle,
} from "@/lib/booking";
import { bookingWindow, firstBookable, type BookingWindow } from "@/lib/booking/dates";
import { MENU_OPEN_EVENT } from "@/lib/events";
import { formatAED } from "@/lib/format";
import { readForm, sendLead } from "@/lib/leads/client";
import { isEmail } from "@/lib/leads/rules";
import { track } from "@/lib/tracking/events";
import { whatsappLink } from "@/lib/whatsapp";
import { PhoneField } from "@/components/forms/PhoneField";
import { Field } from "@/components/ui/Field";
import { CloseIcon } from "@/components/ui/Icons";
import { Seg } from "@/components/ui/Seg";
import { MonthCalendar } from "./MonthCalendar";
import {
  BookingSummary,
  ChoiceCard,
  ChoiceCards,
  Group,
  InclusionsStrip,
  PropertyCard,
  SubPanel,
} from "./parts";

export interface BookingBuilderProps {
  pricing: PropertyPricing;
  /** Today's date in Dubai (ISO), from the server. */
  today: string;
  windowDays: number;
  closedWeekdays: number[];
  slots: string[];
  multiPropertyNote: string;
  whatsappNumber: string;
  /**
   * Phones and tablets (≤ 900px): replace the stacked summary with a sticky bottom bar that opens
   * the summary in a bottom sheet. Off in the styleguide, where a fixed bar would be in the way.
   */
  mobileBar?: boolean;
}

/**
 * Multi-property booking builder (guide §8). State and rules live in lib/booking; this component
 * renders them. Sending: validate → (Phase 6: save the lead and get the server ref) → open WhatsApp
 * with the message → on-page confirmation with the ref.
 */
export function BookingBuilder({
  pricing,
  today,
  windowDays,
  closedWeekdays,
  slots,
  multiPropertyNote,
  whatsappNumber,
  mobileBar = true,
}: BookingBuilderProps) {
  const range = useMemo(
    () => bookingWindow(today, windowDays, closedWeekdays),
    [today, windowDays, closedWeekdays],
  );
  const firstDate = firstBookable(range);
  const firstSlot = slots[0] ?? "Morning";
  const reduce = useMemo(() => reducer(pricing), [pricing]);
  const [state, dispatch] = useReducer(reduce, undefined, (): BookingState => ({
    properties: [blankProperty(1, pricing, firstDate, firstSlot)],
    nextId: 2,
  }));
  const [openId, setOpenId] = useState<number | null>(1);
  const [errors, setErrors] = useState<BookingErrors>({});
  const [sent, setSent] = useState<{ ref: string; url: string; message: string } | null>(null);
  const [sending, setSending] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  // Who the booking is for (owner QA, 3 Oct 2026). Signed in to the portal: prefilled, and the
  // booking joins their account.
  const contact = useRef<HTMLFormElement>(null);
  const [contactErrors, setContactErrors] = useState<Record<string, string>>({});
  const [me, setMe] = useState<Me | null>(null);
  const [inPortal, setInPortal] = useState(false);
  useEffect(() => {
    fetch("/api/portal/me", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((m: Me | null) => {
        if (!m?.signedIn) return;
        setMe(m);
        // Fill only what's still empty: never overwrite what they've started typing.
        const fill = (name: string, value: string) => {
          const el = contact.current?.querySelector<HTMLInputElement>(`input[name=${name}]`);
          if (el && !el.value && value) el.value = value;
        };
        fill("name", m.name);
        fill("email", m.email);
        fill("phone", m.phone.startsWith("+971") ? m.phone.slice(4) : m.phone);
      })
      .catch(() => undefined);
  }, []);
  const started = useRef(0);
  useEffect(() => {
    started.current = Date.now();
  }, []);
  const focusField = useRef<string | null>(null);
  const sheet = useRef<HTMLDialogElement>(null);

  // After a failed send, focus the first invalid field once its card has rendered open.
  useEffect(() => {
    if (!focusField.current) return;
    const el = document.getElementById(focusField.current);
    focusField.current = null;
    if (!el) return;
    el.scrollIntoView({ block: "center" });
    el.focus({ preventScroll: true });
  });

  // The mobile menu covers the page: close the summary sheet if it's open.
  useEffect(() => {
    const close = () => sheet.current?.open && sheet.current.close();
    window.addEventListener(MENU_OPEN_EVENT, close);
    return () => window.removeEventListener(MENU_OPEN_EVENT, close);
  }, []);

  const grandTotal = total(state, pricing);
  // A confirmation only stands while the booking is unchanged; any edit means a fresh send.
  const current = sent && buildMessage(state, pricing, sent.ref) === sent.message ? sent : null;
  const preview = buildMessage(state, pricing, current?.ref ?? null);

  // Once a property is fixed, drop its errors so the red states clear as the user corrects them.
  const liveErrors = useMemo(() => {
    const now = validate(state);
    const out: BookingErrors = {};
    for (const id of Object.keys(errors).map(Number)) if (now[id]) out[id] = now[id];
    return out;
  }, [state, errors]);

  // A property line with every service off can't be sent (owner, 4 Oct 2026).
  const noService = state.properties.some((p) => !p.photo && !p.video && !p.tour);

  function openSheet() {
    const d = sheet.current;
    if (!d || d.open) return;
    d.showModal();
    document.documentElement.style.overflow = "hidden";
  }
  function closeSheet() {
    sheet.current?.close();
  }

  function send() {
    const found = validate(state);
    setErrors(found);
    const firstBad = state.properties.find((p) => found[p.id]);
    if (firstBad) {
      const e = found[firstBad.id];
      closeSheet();
      setOpenId(firstBad.id);
      focusField.current = e.services
        ? `bk-${firstBad.id}-photo`
        : e.area
          ? `bk-${firstBad.id}-area`
          : `bk-${firstBad.id}-building`;
      return;
    }
    const who = contact.current ? readForm(contact.current).values : { fields: {} };
    const missing: Record<string, string> = {};
    if (!who.name) missing.name = "Add your name so we know who the booking is for.";
    if (!who.email) missing.email = "Add your email: it's where we send updates about the booking.";
    else if (!isEmail(who.email))
      missing.email = "That email looks incomplete. Check for a typo (e.g. name@company.com).";
    if (!who.phone) missing.phone = "Add a WhatsApp number for coordinating on the shoot day.";
    setContactErrors(missing);
    if (Object.keys(missing).length) {
      closeSheet();
      const first = (["name", "email", "phone"] as const).find((k) => missing[k]);
      const el = contact.current?.querySelector<HTMLInputElement>(`input[name=${first}]`);
      el?.scrollIntoView({ block: "center" });
      el?.focus({ preventScroll: true });
      return;
    }
    // Already sent and unchanged: just reopen WhatsApp.
    if (current) {
      window.open(current.url, "_blank", "noopener,noreferrer");
      return;
    }
    // Reserve the tab during the tap (pop-up blockers), save the lead, then point it at WhatsApp
    // with the message that starts with the reference the server issued.
    const tab = window.open("", "_blank");
    setSending(true);
    setSaveFailed(false);
    sendLead(
      "property",
      { ...who, fields: {} },
      { hp: "", elapsed: Date.now() - started.current, booking: state },
    ).then((r) => {
      setSending(false);
      if (!r.ok && r.errors && (r.errors.name || r.errors.phone || r.errors.email)) {
        tab?.close();
        setContactErrors(r.errors);
        closeSheet();
        contact.current?.scrollIntoView({ block: "center" });
        return;
      }
      if (r.ok) {
        setInPortal(!!r.portal);
        track(
          "Lead",
          { content_name: "property", lead_type: "property", currency: "AED", value: grandTotal },
          r.ref,
        );
        const message = buildMessage(state, pricing, r.ref);
        const url = whatsappLink(r.message ?? message, whatsappNumber);
        setSent({ ref: r.ref, url, message });
        if (tab) tab.location.href = url;
        else window.open(url, "_blank", "noopener,noreferrer");
        return;
      }
      // Couldn't save on our side: still let the visitor send the booking, minus the ref line.
      const url = whatsappLink(
        buildMessage(state, pricing, null).split("\n").slice(1).join("\n"),
        whatsappNumber,
      );
      setSaveFailed(true);
      if (tab) tab.location.href = url;
      else window.open(url, "_blank", "noopener,noreferrer");
    });
  }

  const count = state.properties.length;
  const summary = (
    <BookingSummary
      total={grandTotal}
      message={preview}
      items={state.properties.map((p) => ({
        title: title(p, pricing),
        location: locationText(p),
        services: servicesText(p).join(" + ") || "No services yet",
        when: `${dateLabel(p.date)} · ${p.slot}`,
        subtotal: subtotal(p, pricing),
      }))}
      action={
        <div className="stack" style={{ gap: 12 }}>
          {current && (
            <div className="done" role="status">
              <b>Request ready.</b>
              <p className="muted" style={{ margin: 0 }}>
                WhatsApp opened with your booking. Send the message and we&apos;ll confirm your
                slot.
              </p>
              {inPortal && (
                <p className="fine">
                  It&apos;s in your client portal too.{" "}
                  <Link className="lnk" href="/portal/shoots" prefetch={false}>
                    Open it
                  </Link>
                </p>
              )}
              <p className="fine">
                Ref #{current.ref} ·{" "}
                <a className="lnk" href={current.url} target="_blank" rel="noopener noreferrer">
                  WhatsApp didn&apos;t open? Open it here
                </a>
              </p>
            </div>
          )}
          {saveFailed && !current && (
            <p className="fine" role="status">
              We couldn&apos;t save a copy on our side, but WhatsApp has your full booking. Just
              send it.
            </p>
          )}
          {noService && (
            <p className="fine bk-warn" id="bk-need-service" role="status">
              Pick at least one service
              {state.properties.length > 1 ? " for every property" : ""}.
            </p>
          )}
          <button
            type="button"
            className="btn btn-p"
            onClick={send}
            disabled={sending || noService}
            aria-describedby={noService ? "bk-need-service" : undefined}
          >
            {sending ? "Sending…" : "Send request on WhatsApp"}
          </button>
        </div>
      }
    />
  );

  return (
    <div className={mobileBar ? "bk has-bar" : "bk"}>
      <div className="props">
        {state.properties.map((p, i) => (
          <PropertyEditor
            key={p.id}
            p={p}
            index={i}
            canRemove={count > 1}
            open={openId === p.id}
            errors={liveErrors[p.id]}
            pricing={pricing}
            range={range}
            slots={slots}
            onToggleOpen={() => setOpenId(openId === p.id ? null : p.id)}
            dispatch={dispatch}
            onDuplicate={() => {
              setOpenId(state.nextId);
              dispatch({ type: "duplicate", id: p.id });
            }}
            onRemove={() => {
              const next = state.properties[i + 1] ?? state.properties[i - 1];
              setOpenId(next?.id ?? null);
              dispatch({ type: "remove", id: p.id });
            }}
          />
        ))}
        <button
          type="button"
          className="addprop"
          onClick={() => {
            setOpenId(state.nextId);
            dispatch({ type: "add", date: firstDate, slot: firstSlot });
          }}
        >
          + Add another property
        </button>
        <p className="multi">{multiPropertyNote}</p>
        <form
          ref={contact}
          className="bk-contact"
          aria-labelledby="bk-contact-h"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
        >
          <span className="eb" id="bk-contact-h">
            Your details
          </span>
          {me && (
            <p className="fine" style={{ margin: 0 }}>
              Signed in as {me.email}.
              {me.attaches ? ` The booking goes straight into your portal (${me.account}).` : ""}
            </p>
          )}
          <div className="row2">
            <Field label="Name" error={contactErrors.name}>
              <input
                name="name"
                autoComplete="name"
                required
                maxLength={120}
                aria-invalid={!!contactErrors.name || undefined}
              />
            </Field>
            <Field label="Email" error={contactErrors.email}>
              <input
                name="email"
                type="email"
                autoComplete="email"
                required
                aria-invalid={!!contactErrors.email || undefined}
              />
            </Field>
          </div>
          <PhoneField
            label="WhatsApp number"
            error={contactErrors.phone}
            invalid={!!contactErrors.phone}
          />
          <p className="fine" style={{ margin: 0 }}>
            For coordinating on the shoot day.
            {me && !me.phone ? " We’ll save it to your profile." : ""}
          </p>
          {!me && (
            <p className="fine" style={{ margin: 0 }}>
              Updates go to your email, and the booking shows up in your client portal when you sign
              in with it.
            </p>
          )}
        </form>
      </div>

      {summary}

      {mobileBar && (
        <>
          <div className="bk-bar" role="region" aria-label="Booking total">
            <span>
              <small>
                {count} {count === 1 ? "property" : "properties"} · estimated
              </small>
              <b>{formatAED(grandTotal)}</b>
            </span>
            <button type="button" className="btn btn-p" onClick={openSheet} aria-haspopup="dialog">
              Review &amp; send
            </button>
          </div>
          <dialog
            ref={sheet}
            className="sheet"
            aria-label="Booking summary"
            onClose={() => (document.documentElement.style.overflow = "")}
            onClick={(e) => {
              // Tap on the backdrop closes the sheet.
              if (e.target === e.currentTarget) closeSheet();
            }}
          >
            <div className="sheet-h">
              <span className="eb">Review your booking</span>
              <button
                type="button"
                className="icon-btn"
                aria-label="Close summary"
                onClick={closeSheet}
              >
                <CloseIcon />
              </button>
            </div>
            {summary}
          </dialog>
        </>
      )}
    </div>
  );
}

type Me = {
  signedIn: true;
  name: string;
  email: string;
  phone: string;
  account: string;
  attaches: boolean;
};

type Panel = "photo" | "video";
const LIGHTING_SHORT = { day: "day", night: "night", dayNight: "day + night" } as const;

/** One-line summaries shown on selected service cards. */
function photoSummary(p: BookingProperty) {
  return p.twilight ? `+ ${p.twilightQty} twilight` : "No add-ons";
}
function videoSummary(p: BookingProperty) {
  const parts: string[] = [];
  if (p.short) parts.push("Short-form");
  if (p.long) {
    parts.push(p.type === "commercial" ? "Long-form" : `Long-form (${LIGHTING_SHORT[p.lighting]})`);
  }
  return parts.join(" + ");
}

function PropertyEditor({
  p,
  index,
  canRemove,
  open,
  errors,
  pricing,
  range,
  slots,
  onToggleOpen,
  dispatch,
  onDuplicate,
  onRemove,
}: {
  p: BookingProperty;
  index: number;
  canRemove: boolean;
  open: boolean;
  errors?: Partial<Record<"services" | "area" | "building", string>>;
  pricing: PropertyPricing;
  range: BookingWindow;
  slots: string[];
  onToggleOpen: () => void;
  dispatch: React.Dispatch<Action>;
  onDuplicate: () => void;
  onRemove: () => void;
}) {
  const sub = subtotal(p, pricing);
  const services = servicesText(p).join(" + ");
  const where = [p.building.trim(), p.area.trim()].filter(Boolean).join(", ");
  const update = (patch: Partial<BookingProperty>) => dispatch({ type: "update", id: p.id, patch });
  const fid = (f: string) => `bk-${p.id}-${f}`;

  return (
    <PropertyCard
      index={index}
      title={title(p, pricing)}
      summary={`${where || "Location to add"} · ${services || "No services yet"} · ${dateLabel(p.date)}`}
      subtotal={sub}
      open={open}
      invalid={!!errors}
      onToggle={onToggleOpen}
    >
      <PropertyOptions p={p} pricing={pricing} dispatch={dispatch} errors={errors} />

      <Group label="Location">
        <div className="row3">
          <label className="fld">
            Community / area
            <input
              id={fid("area")}
              value={p.area}
              placeholder="e.g. Dubai Marina"
              autoComplete="off"
              aria-invalid={errors?.area ? true : undefined}
              onChange={(e) => update({ area: e.target.value })}
            />
            {errors?.area && <span className="err">{errors.area}</span>}
          </label>
          <label className="fld">
            Building / tower
            <input
              id={fid("building")}
              value={p.building}
              placeholder="e.g. Marina Heights"
              autoComplete="off"
              aria-invalid={errors?.building ? true : undefined}
              onChange={(e) => update({ building: e.target.value })}
            />
            {errors?.building && <span className="err">{errors.building}</span>}
          </label>
          <label className="fld">
            Unit number
            <input
              id={fid("unit")}
              value={p.unit}
              placeholder="Optional"
              autoComplete="off"
              onChange={(e) => update({ unit: e.target.value })}
            />
          </label>
        </div>
      </Group>

      <Group label="Preferred date and time">
        <div className="when">
          <div className="when-in">
            <MonthCalendar value={p.date} onChange={(v) => update({ date: v })} range={range} />
            <div className="when-slots">
              <span className="gl">Time</span>
              <Seg
                label="Time slot"
                className="slots grid"
                value={p.slot}
                onChange={(v) => update({ slot: v })}
                isDisabled={(v) => needsEvening(p) && v !== EVENING}
                options={slots.map((s) => ({ value: s, label: s }))}
              />
              {needsEvening(p) && (
                <p className="note">Evening only: night footage is part of this booking.</p>
              )}
            </div>
          </div>
        </div>
      </Group>

      <div className="prop-f">
        <span style={{ display: "flex", gap: 18 }}>
          <button type="button" className="txtbtn" onClick={onDuplicate}>
            ⧉ Duplicate
          </button>
          {canRemove && (
            <button type="button" className="txtbtn" onClick={onRemove}>
              ✕ Remove
            </button>
          )}
        </span>
        <span className="tab-num" style={{ fontFamily: "var(--font-mono)" }}>
          Subtotal {formatAED(sub)}
        </span>
      </div>
    </PropertyCard>
  );
}

/**
 * Property type, size and services with their prices: the same builder on the website and in the
 * portal's "Book a shoot" (owner, 10 Oct 2026). Prices come from the global property price list.
 */
export function PropertyOptions({
  p,
  pricing,
  dispatch,
  errors,
}: {
  p: BookingProperty;
  pricing: PropertyPricing;
  dispatch: React.Dispatch<Action>;
  errors?: Partial<Record<"services" | "area" | "building", string>>;
}) {
  const prices = servicePrices(p, pricing);
  const tier = p.type === "commercial" ? pricing.commercial.tiers[p.size] : null;
  const longLocked = isLocked(p, "long", pricing);
  const tourLocked = isLocked(p, "tour", pricing);
  const notIn = tier ? `Not in ${tier.label}` : "";
  const twi = twilightTable(p, pricing);
  const update = (patch: Partial<BookingProperty>) => dispatch({ type: "update", id: p.id, patch });
  const tog = (key: Toggle) => dispatch({ type: "toggle", id: p.id, key });
  const fid = (f: string) => `bk-${p.id}-${f}`;
  const selected = { photo: p.photo, video: p.video, tour: p.tour };
  /** Service cards toggle (owner, 3 Oct 2026): click to select, click again to deselect. A
   *  selected service shows its options under it; deselecting resets them (lib/booking). */
  const pick = (key: Panel | "tour") => tog(key);
  const isOpen = (key: Panel) => selected[key];
  const short = (lg: string, sm: string): ReactNode =>
    lg === sm ? (
      lg
    ) : (
      <>
        <span className="lbl-lg">{lg}</span>
        <span className="lbl-sm">{sm}</span>
      </>
    );
  return (
    <>
      <Group label="Property type">
        <Seg
          label="Property type"
          className="grid"
          value={p.type}
          onChange={(v) => dispatch({ type: "setType", id: p.id, value: v })}
          options={[
            {
              value: "apartment",
              label: pricing.apartment.label,
              ariaLabel: pricing.apartment.label,
            },
            {
              value: "villa",
              label: short(pricing.villa.label, pricing.villa.label.split(" /")[0]),
              ariaLabel: pricing.villa.label,
            },
            {
              value: "commercial",
              label: pricing.commercial.label,
              ariaLabel: pricing.commercial.label,
            },
          ]}
        />
      </Group>

      {p.type === "commercial" ? (
        <Group label="Property scale">
          <ChoiceCards cols={4}>
            {pricing.commercial.tiers.map((t, i) => (
              <ChoiceCard
                key={t.label}
                title={t.label}
                sub={t.description}
                badge={t.popular ? "Most popular" : undefined}
                pressed={p.size === i}
                onClick={() => update({ size: i })}
              />
            ))}
          </ChoiceCards>
          {tier && (
            <InclusionsStrip
              items={[
                { label: "Photos", value: tier.includes.photos },
                { label: "Reel", value: tier.includes.reel },
                { label: "Walkthrough", value: tier.includes.walkthrough },
                { label: "360 tour", value: tier.includes.tourHotspots },
              ]}
            />
          )}
        </Group>
      ) : (
        <Group label="Size">
          <Seg
            label="Size"
            className="sizes grid"
            value={p.size}
            onChange={(v) => update({ size: v })}
            options={pricing[p.type].sizes.map((s, i) => ({ value: i, label: s.label }))}
          />
        </Group>
      )}

      <Group label="Services">
        <div className="svc-grid">
          <ChoiceCard
            col={0}
            id={fid("photo")}
            controls={p.photo ? fid("photo-opts") : undefined}
            expanded={isOpen("photo")}
            title="Photography"
            sub={`Delivery ${pricing.delivery.photo}`}
            price={formatAED(prices.photo)}
            summary={photoSummary(p)}
            pressed={p.photo}
            onClick={() => pick("photo")}
          />
          {p.photo && (
            <SubPanel id={fid("photo-opts")} pointTo={0} label="Photography options">
              <ChoiceCards cols={2}>
                <ChoiceCard
                  title="Twilight images"
                  sub="Edited from your daylight shots"
                  price={`From ${formatAED(twi[TWILIGHT_QTYS[0]])}`}
                  pressed={p.twilight}
                  onClick={() => tog("twilight")}
                />
              </ChoiceCards>
              {p.twilight && (
                <>
                  <Seg
                    label="Twilight images"
                    value={p.twilightQty}
                    onChange={(v) => update({ twilightQty: v })}
                    options={TWILIGHT_QTYS.map((q) => ({
                      value: q,
                      label: `${q} images · ${formatAED(twi[q])}`,
                    }))}
                  />
                  <p className="note">{twilightNote(p, pricing)}</p>
                </>
              )}
            </SubPanel>
          )}
          <ChoiceCard
            col={1}
            controls={p.video ? fid("video-opts") : undefined}
            expanded={isOpen("video")}
            title="Videography"
            sub="Short-form, long-form or both"
            price={
              p.video
                ? formatAED(
                    (p.short ? prices.short : 0) +
                      (p.long && prices.long !== null ? prices.long : 0),
                  )
                : `From ${formatAED(prices.short)}`
            }
            summary={videoSummary(p)}
            pressed={p.video}
            onClick={() => pick("video")}
          />
          {p.video && (
            <SubPanel id={fid("video-opts")} pointTo={1} label="Videography options">
              <span className="gl">Video format</span>
              <ChoiceCards cols={2}>
                <ChoiceCard
                  title="Short-form"
                  sub={`Social media reels · ${pricing.delivery.short}`}
                  price={formatAED(prices.short)}
                  pressed={p.short}
                  onClick={() => tog("short")}
                />
                <ChoiceCard
                  title="Long-form"
                  sub={`YouTube walkthrough · ${pricing.delivery.long}`}
                  price={longLocked ? notIn : formatAED(prices.long ?? 0)}
                  pressed={p.long}
                  disabled={longLocked}
                  onClick={() => tog("long")}
                />
              </ChoiceCards>
              {p.long && p.type !== "commercial" && (
                <>
                  <span className="gl">Lighting</span>
                  <Seg
                    label="Lighting"
                    className="grid"
                    value={p.lighting}
                    onChange={(v) => update({ lighting: v })}
                    options={[
                      { value: "day", label: "Daylight" },
                      { value: "night", label: "Night" },
                      { value: "dayNight", label: "Day + night" },
                    ]}
                  />
                  {p.lighting !== "day" && (
                    <p className="note">
                      Night footage needs an evening slot, so we&apos;ll book you in the evening.
                    </p>
                  )}
                </>
              )}
            </SubPanel>
          )}
          <ChoiceCard
            col={2}
            title="360° tour"
            sub={`Delivery ${pricing.delivery.tour}`}
            price={tourLocked ? notIn : formatAED(prices.tour ?? 0)}
            pressed={p.tour}
            disabled={tourLocked}
            onClick={() => pick("tour")}
          />
        </div>
        {errors?.services && (
          <p className="bk-err" role="alert">
            {errors.services}
          </p>
        )}
      </Group>
    </>
  );
}
