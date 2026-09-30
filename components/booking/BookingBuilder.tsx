"use client";

import { useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from "react";
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
import { formatAED } from "@/lib/format";
import { whatsappLink } from "@/lib/whatsapp";
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
    // Provisional reference until /api/lead issues the real one (Phase 6).
    const ref = `MW-${Math.floor(1000 + Math.random() * 9000)}`;
    const message = buildMessage(state, pricing, ref);
    const url = whatsappLink(message, whatsappNumber);
    setSent({ ref, url, message });
    window.open(url, "_blank", "noopener,noreferrer");
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
              <p className="fine">
                Ref #{current.ref} ·{" "}
                <a className="lnk" href={current.url} target="_blank" rel="noopener noreferrer">
                  WhatsApp didn&apos;t open? Open it here
                </a>
              </p>
            </div>
          )}
          <button type="button" className="btn btn-p" onClick={send}>
            Send request on WhatsApp
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
  const prices = servicePrices(p, pricing);
  const sub = subtotal(p, pricing);
  const services = servicesText(p).join(" + ");
  const where = [p.building.trim(), p.area.trim()].filter(Boolean).join(", ");
  const tier = p.type === "commercial" ? pricing.commercial.tiers[p.size] : null;
  const longLocked = isLocked(p, "long", pricing);
  const tourLocked = isLocked(p, "tour", pricing);
  const notIn = tier ? `Not in ${tier.label}` : "";
  const twi = twilightTable(p, pricing);
  const update = (patch: Partial<BookingProperty>) => dispatch({ type: "update", id: p.id, patch });
  const tog = (key: Toggle) => dispatch({ type: "toggle", id: p.id, key });
  const fid = (f: string) => `bk-${p.id}-${f}`;
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
    <PropertyCard
      index={index}
      title={title(p, pricing)}
      summary={`${where || "Location to add"} · ${services || "No services yet"} · ${dateLabel(p.date)}`}
      subtotal={sub}
      open={open}
      invalid={!!errors}
      onToggle={onToggleOpen}
    >
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
            id={fid("photo")}
            controls={p.photo ? fid("photo-opts") : undefined}
            title="Photography"
            sub={`Delivery ${pricing.delivery.photo}`}
            price={formatAED(prices.photo)}
            pressed={p.photo}
            onClick={() => tog("photo")}
          />
          {p.photo && (
            <SubPanel id={fid("photo-opts")} pointTo={0} label="Photography options">
              <label className="chk">
                <input type="checkbox" checked={p.twilight} onChange={() => tog("twilight")} /> Add
                twilight images{" "}
                <span className="muted" style={{ fontSize: 13 }}>
                  (edited from your daylight shots)
                </span>
              </label>
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
            controls={p.video ? fid("video-opts") : undefined}
            title="Videography"
            sub="Short-form, long-form or both"
            price={p.video ? "Choose below" : `From ${formatAED(prices.short)}`}
            pressed={p.video}
            onClick={() => tog("video")}
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
            title="360° tour"
            sub={`Delivery ${pricing.delivery.tour}`}
            price={tourLocked ? notIn : formatAED(prices.tour ?? 0)}
            pressed={p.tour}
            disabled={tourLocked}
            onClick={() => tog("tour")}
          />
        </div>
        {errors?.services && (
          <p className="bk-err" role="alert">
            {errors.services}
          </p>
        )}
      </Group>

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
        <MonthCalendar value={p.date} onChange={(v) => update({ date: v })} range={range} />
        <Seg
          label="Time slot"
          className="grid"
          value={p.slot}
          onChange={(v) => update({ slot: v })}
          isDisabled={(v) => needsEvening(p) && v !== EVENING}
          options={slots.map((s) => ({ value: s, label: s }))}
        />
        {needsEvening(p) && (
          <p className="note">Evening only: night footage is part of this booking.</p>
        )}
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
