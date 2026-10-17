"use client";

import type { ReactNode } from "react";
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

/** Line icons for the type and service tiles (24px grid, stroke follows the text colour). */
const ICON_PATHS = {
  apartment:
    "M5 21V4h10v17M15 9h4v12M3 21h18M8 7h1M11 7h1M8 10h1M11 10h1M8 13h1M11 13h1M8 16h1M11 16h1",
  villa: "M3 11l9-7 9 7M5 9.5V20h14V9.5M10 20v-5h4v5",
  commercial: "M3 21h18M4 21V8l8-4 8 4v13M8 11h2M14 11h2M8 15h2M14 15h2",
  photo: "M4 8h3l2-3h6l2 3h3v11H4zM12 16.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z",
  tour: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z",
} as const;
function Icon({ name }: { name: keyof typeof ICON_PATHS }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="24"
      height="24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinejoin="round"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d={ICON_PATHS[name]} />
    </svg>
  );
}

/**
 * The Photos card (site-refine, 18 Oct 2026): property type and size set the photography price;
 * Twilight images and a 360° tour are add-ons. Videos are booked on their own card, one price per
 * video (no videography by size). The same builder in the portal's "Book a shoot" and the
 * website's dashboard preview. Prices come from the property price list.
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
    <>
      <Group label="Property type">
        <Seg
          label="Property type"
          className="ptype grid"
          value={p.type}
          onChange={(v) => dispatch({ type: "setType", id: p.id, value: v })}
          options={(["apartment", "villa", "commercial"] as const).map((t) => {
            const l = pricing[t].label;
            return {
              value: t,
              label: (
                <>
                  <Icon name={t} />
                  <span>{t === "villa" ? short(l, l.split(" /")[0]) : l}</span>
                </>
              ),
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

      <p className="note" data-testid="photo-price">
        Photography <b>{formatAED(prices.photo)}</b> · delivery {pricing.delivery.photo}
      </p>

      <Group label="Add-ons">
        <ChoiceCards cols={2}>
          <ChoiceCard
            id={fid("twilight")}
            title="Twilight images"
            sub="Edited from your daylight shots"
            price={`From ${formatAED(twi[TWILIGHT_QTYS[0]])}`}
            pressed={p.twilight}
            onClick={() => tog("twilight")}
          />
          <ChoiceCard
            id={fid("tour")}
            icon={<Icon name="tour" />}
            title="360° tour"
            sub={`Delivery ${pricing.delivery.tour}`}
            price={tourLocked ? notIn : formatAED(prices.tour ?? 0)}
            pressed={p.tour}
            disabled={tourLocked}
            onClick={() => tog("tour")}
          />
        </ChoiceCards>
        {p.twilight && (
          <SubPanel id={fid("twilight-opts")} pointTo={0} label="Twilight images">
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
          </SubPanel>
        )}
        {errors?.services && (
          <p className="bk-err" role="alert">
            {errors.services}
          </p>
        )}
      </Group>
    </>
  );
}
