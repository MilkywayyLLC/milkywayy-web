"use client";

import { useEffect, useMemo, useReducer, useRef, useState } from "react";
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
import { formatAED } from "@/lib/format";
import { whatsappLink } from "@/lib/whatsapp";
import { Seg } from "@/components/ui/Seg";
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
  /** ISO dates offered as chips (computed on the server in Dubai time). */
  dates: string[];
  slots: string[];
  multiPropertyNote: string;
  whatsappNumber: string;
}

/**
 * Multi-property booking builder (guide §8). State and rules live in lib/booking; this component
 * renders them. Sending: validate → (Phase 6: save the lead and get the server ref) → open WhatsApp
 * with the message → on-page confirmation with the ref.
 */
export function BookingBuilder({
  pricing,
  dates,
  slots,
  multiPropertyNote,
  whatsappNumber,
}: BookingBuilderProps) {
  const reduce = useMemo(() => reducer(pricing), [pricing]);
  const [state, dispatch] = useReducer(reduce, undefined, (): BookingState => ({
    properties: [blankProperty(1, pricing, dates[0] ?? "", slots[0] ?? "Morning")],
    nextId: 2,
  }));
  const [openId, setOpenId] = useState<number | null>(1);
  const [errors, setErrors] = useState<BookingErrors>({});
  const [sent, setSent] = useState<{ ref: string; url: string; message: string } | null>(null);
  const focusField = useRef<string | null>(null);

  // After a failed send, focus the first invalid field once its card has rendered open.
  useEffect(() => {
    if (!focusField.current) return;
    document.getElementById(focusField.current)?.focus();
    focusField.current = null;
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

  function send() {
    const found = validate(state);
    setErrors(found);
    const firstBad = state.properties.find((p) => found[p.id]);
    if (firstBad) {
      const e = found[firstBad.id];
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

  const add = () => {
    setOpenId(state.nextId);
    dispatch({ type: "add", date: dates[0] ?? "", slot: slots[0] ?? "Morning" });
  };

  return (
    <div className="bk">
      <div className="props">
        {state.properties.map((p, i) => (
          <PropertyEditor
            key={p.id}
            p={p}
            index={i}
            canRemove={state.properties.length > 1}
            open={openId === p.id}
            errors={liveErrors[p.id]}
            pricing={pricing}
            dates={dates}
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
        <button type="button" className="addprop" onClick={add}>
          + Add another property
        </button>
        <p className="multi">{multiPropertyNote}</p>
      </div>

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
  dates,
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
  dates: string[];
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

  return (
    <PropertyCard
      index={index}
      title={title(p, pricing)}
      summary={`${where || "Location to add"} · ${services || "No services yet"}`}
      subtotal={sub}
      open={open}
      invalid={!!errors}
      onToggle={onToggleOpen}
    >
      <Group label="Property type">
        <Seg
          label="Property type"
          value={p.type}
          onChange={(v) => dispatch({ type: "setType", id: p.id, value: v })}
          options={[
            { value: "apartment", label: pricing.apartment.label },
            { value: "villa", label: pricing.villa.label },
            { value: "commercial", label: pricing.commercial.label },
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
            value={p.size}
            onChange={(v) => update({ size: v })}
            options={pricing[p.type].sizes.map((s, i) => ({ value: i, label: s.label }))}
          />
        </Group>
      )}

      <Group label="Services">
        <ChoiceCards>
          <ChoiceCard
            id={fid("photo")}
            title="Photography"
            sub={`Delivery ${pricing.delivery.photo}`}
            price={formatAED(prices.photo)}
            pressed={p.photo}
            onClick={() => tog("photo")}
          />
          <ChoiceCard
            title="Videography"
            sub="Short-form, long-form or both"
            price={p.video ? "Choose below" : `From ${formatAED(prices.short)}`}
            pressed={p.video}
            onClick={() => tog("video")}
          />
          <ChoiceCard
            title="360° tour"
            sub={`Delivery ${pricing.delivery.tour}`}
            price={tourLocked ? notIn : formatAED(prices.tour ?? 0)}
            pressed={p.tour}
            disabled={tourLocked}
            onClick={() => tog("tour")}
          />
        </ChoiceCards>
        {errors?.services && (
          <p className="bk-err" role="alert">
            {errors.services}
          </p>
        )}

        {p.photo && (
          <SubPanel>
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

        {p.video && (
          <SubPanel>
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
        <Seg
          label="Date"
          value={p.date}
          onChange={(v) => update({ date: v })}
          options={dates.map((d) => ({ value: d, label: dateLabel(d) }))}
        />
        <Seg
          label="Time slot"
          value={p.slot}
          onChange={(v) => update({ slot: v })}
          isDisabled={(v) => needsEvening(p) && v !== EVENING}
          options={slots.map((s) => ({ value: s, label: s }))}
        />
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
