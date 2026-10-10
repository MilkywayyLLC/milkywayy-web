"use client";

import { useState, type ReactNode } from "react";
import type { PropertyPricing } from "@/content/types";
import {
  TWILIGHT_QTYS,
  isLocked,
  servicePrices,
  twilightNote,
  twilightTable,
  type Action,
  type BookingProperty,
  type Toggle,
} from "@/lib/booking";
import { formatAED } from "@/lib/format";
import { Seg } from "@/components/ui/Seg";
import { ChoiceCard, ChoiceCards, Group, InclusionsStrip, SubPanel } from "./parts";

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
  // One expanded panel at a time (owner, 10 Oct 2026): choosing Videography opens its options and
  // folds Photography's away, and vice versa. Clicking a chosen card that's folded opens it;
  // clicking the open one deselects it.
  const [panel, setPanel] = useState<"photo" | "video" | null>(
    p.video ? "video" : p.photo ? "photo" : null,
  );
  const pick = (key: "photo" | "video") => {
    if (!p[key]) {
      tog(key);
      setPanel(key);
    } else if (panel !== key) setPanel(key);
    else {
      tog(key);
      setPanel(key === "photo" ? (p.video ? "video" : null) : p.photo ? "photo" : null);
    }
  };
  const fid = (f: string) => `bk-${p.id}-${f}`;
  /* Service cards toggle (owner, 3 Oct 2026): click to select, click again to deselect. A
   * selected service shows its options under it; deselecting resets them (lib/booking). */
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
          options={(["apartment", "villa", "commercial"] as const).map((t) => {
            const l = pricing[t].label;
            return {
              value: t,
              label: t === "villa" ? short(l, l.split(" /")[0]) : l,
              ariaLabel: l,
            };
          })}
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
            expanded={p.photo && panel === "photo"}
            title="Photography"
            sub={`Delivery ${pricing.delivery.photo}`}
            price={formatAED(prices.photo)}
            summary={photoSummary(p)}
            pressed={p.photo}
            onClick={() => pick("photo")}
          />
          {p.photo && panel === "photo" && (
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
            expanded={p.video && panel === "video"}
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
          {p.video && panel === "video" && (
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
            onClick={() => tog("tour")}
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
