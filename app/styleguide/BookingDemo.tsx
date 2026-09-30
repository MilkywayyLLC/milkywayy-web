"use client";

import { useState } from "react";
import {
  BookingSummary,
  ChoiceCard,
  ChoiceCards,
  Group,
  InclusionsStrip,
  PropertyCard,
  SubPanel,
} from "@/components/booking/parts";
import { Seg } from "@/components/ui/Seg";
import type { PropertyPricing } from "@/content/types";
import { formatAED } from "@/lib/format";

const noop = () => {};

/**
 * Static look of the booking builder for design review. Only opening/closing cards works;
 * the real state, prices and locks (guide §8) are Phase 3. Prices shown are read from the
 * pricing config, not typed in here.
 */
export function BookingDemo({ pricing }: { pricing: PropertyPricing }) {
  const [open, setOpen] = useState<number>(0);
  const apt = pricing.apartment.sizes[1]; // 1 Bed
  const twi = pricing.twilight.standard;
  const sub1 = apt.photo + twi[10] + apt.short + apt.long.dayNight;
  const apt2 = pricing.apartment.sizes[2];
  const sub2 = apt2.photo;
  const essential = pricing.commercial.tiers[1];

  const message = [
    "Ref #MW-1042",
    "Hi Milkywayy,",
    "I'd like to book 2 properties:",
    "1. 1 Bed apartment — Photography + 10 twilight + Short-form video + Long-form video (day + night).",
    "Unit 1205, Marina Heights, Dubai Marina · Thu 2 Oct, evening",
    "2. 2 Bed apartment — Photography.",
    "Marina Gate 1, Dubai Marina · Thu 2 Oct, morning",
  ].join("\n");

  return (
    <div className="bk">
      <div className="props">
        <PropertyCard
          index={0}
          title="1 Bed apartment"
          summary="Marina Heights, Dubai Marina · Photography + 10 twilight + Short-form video + Long-form video (day + night)"
          subtotal={sub1}
          open={open === 0}
          onToggle={() => setOpen(open === 0 ? -1 : 0)}
        >
          <Group label="Property type">
            <Seg
              label="Property type"
              value="apartment"
              onChange={noop}
              options={[
                { value: "apartment", label: "Apartment" },
                { value: "villa", label: "Villa / townhouse" },
                { value: "commercial", label: "Commercial" },
              ]}
            />
          </Group>
          <Group label="Size">
            <Seg
              label="Size"
              value={1}
              onChange={noop}
              options={pricing.apartment.sizes.map((s, i) => ({ value: i, label: s.label }))}
            />
          </Group>
          <Group label="Services">
            <ChoiceCards>
              <ChoiceCard
                title="Photography"
                sub={`Delivery ${pricing.delivery.photo}`}
                price={formatAED(apt.photo)}
                pressed
                onClick={noop}
              />
              <ChoiceCard
                title="Videography"
                sub="Short-form, long-form or both"
                price="Choose below"
                pressed
                onClick={noop}
              />
              <ChoiceCard
                title="360° tour"
                sub={`Delivery ${pricing.delivery.tour}`}
                price={formatAED(apt.tour)}
                pressed={false}
                onClick={noop}
              />
            </ChoiceCards>
            <SubPanel>
              <label className="chk">
                <input type="checkbox" defaultChecked /> Add twilight images{" "}
                <span className="muted" style={{ fontSize: 13 }}>
                  (edited from your daylight shots)
                </span>
              </label>
              <Seg
                label="Twilight images"
                value={10}
                onChange={noop}
                options={([5, 10, 20] as const).map((q) => ({
                  value: q,
                  label: `${q} images · ${formatAED(twi[q])}`,
                }))}
              />
              <p className="note">
                AED {twi[10] / 10} per image. You save {formatAED((twi[5] / 5) * 10 - twi[10])}.
              </p>
            </SubPanel>
            <SubPanel>
              <span className="gl">Video format</span>
              <ChoiceCards cols={2}>
                <ChoiceCard
                  title="Short-form"
                  sub={`Social media reels · ${pricing.delivery.short}`}
                  price={formatAED(apt.short)}
                  pressed
                  onClick={noop}
                />
                <ChoiceCard
                  title="Long-form"
                  sub={`YouTube walkthrough · ${pricing.delivery.long}`}
                  price={formatAED(apt.long.dayNight)}
                  pressed
                  onClick={noop}
                />
              </ChoiceCards>
              <span className="gl">Lighting</span>
              <Seg
                label="Lighting"
                value="dayNight"
                onChange={noop}
                options={[
                  { value: "day", label: "Daylight" },
                  { value: "night", label: "Night" },
                  { value: "dayNight", label: "Day + night" },
                ]}
              />
              <p className="note">
                Night footage needs an evening slot, so we&apos;ll book you in the evening.
              </p>
            </SubPanel>
          </Group>
          <Group label="Location">
            <div className="row3">
              <label className="fld">
                Community / area
                <input defaultValue="Dubai Marina" />
              </label>
              <label className="fld">
                Building / tower
                <input defaultValue="Marina Heights" />
              </label>
              <label className="fld">
                Unit number
                <input defaultValue="1205" placeholder="Optional" />
              </label>
            </div>
          </Group>
          <Group label="Preferred date and time">
            <Seg
              label="Date"
              value="Thu 2 Oct"
              onChange={noop}
              options={["Thu 2 Oct", "Fri 3 Oct", "Sat 4 Oct", "Mon 6 Oct", "Tue 7 Oct"].map(
                (d) => ({ value: d, label: d }),
              )}
            />
            <Seg
              label="Time slot"
              value="Evening"
              onChange={noop}
              isDisabled={(v) => v !== "Evening"}
              options={["Morning", "Afternoon", "Evening"].map((s) => ({ value: s, label: s }))}
            />
          </Group>
          <div className="prop-f">
            <span style={{ display: "flex", gap: 18 }}>
              <button type="button" className="txtbtn">
                ⧉ Duplicate
              </button>
              <button type="button" className="txtbtn">
                ✕ Remove
              </button>
            </span>
            <span className="tab-num" style={{ fontFamily: "var(--font-mono)" }}>
              Subtotal {formatAED(sub1)}
            </span>
          </div>
        </PropertyCard>

        <PropertyCard
          index={1}
          title="2 Bed apartment"
          summary="Marina Gate 1, Dubai Marina · Photography"
          subtotal={sub2}
          open={open === 1}
          onToggle={() => setOpen(open === 1 ? -1 : 1)}
        >
          <Group label="Property scale (commercial example)">
            <ChoiceCards cols={4}>
              {pricing.commercial.tiers.map((t, i) => (
                <ChoiceCard
                  key={t.label}
                  title={t.label}
                  sub={t.description}
                  pressed={i === 1}
                  badge={t.popular ? "Most popular" : undefined}
                  onClick={noop}
                />
              ))}
            </ChoiceCards>
            <InclusionsStrip
              items={[
                { label: "Photos", value: essential.includes.photos },
                { label: "Reel", value: essential.includes.reel },
                { label: "Walkthrough", value: essential.includes.walkthrough },
                { label: "360 tour", value: essential.includes.tourHotspots },
              ]}
            />
            <InclusionsStrip
              items={[
                { label: "Photos", value: pricing.commercial.tiers[0].includes.photos },
                { label: "Reel", value: pricing.commercial.tiers[0].includes.reel },
                { label: "Walkthrough", value: null },
                { label: "360 tour", value: null },
              ]}
            />
            <ChoiceCards>
              <ChoiceCard
                title="Long-form"
                sub="Basic tier"
                price="Not in Basic"
                pressed={false}
                disabled
                onClick={noop}
              />
              <ChoiceCard
                title="360° tour"
                sub="Basic tier"
                price="Not in Basic"
                pressed={false}
                disabled
                onClick={noop}
              />
            </ChoiceCards>
          </Group>
        </PropertyCard>

        <button type="button" className="addprop">
          + Add another property
        </button>
        <p className="multi">
          Shooting more than one property on the same day or in the same area? We&apos;ll send you a
          better price for the whole booking in the same chat.
        </p>
      </div>

      <BookingSummary
        total={sub1 + sub2}
        message={message}
        items={[
          {
            title: "1 Bed apartment",
            location: "1205, Marina Heights, Dubai Marina",
            services:
              "Photography + 10 twilight + Short-form video + Long-form video (day + night)",
            when: "Thu 2 Oct · Evening",
            subtotal: sub1,
          },
          {
            title: "2 Bed apartment",
            location: "Marina Gate 1, Dubai Marina",
            services: "Photography",
            when: "Thu 2 Oct · Morning",
            subtotal: sub2,
          },
        ]}
        action={
          <button type="button" className="btn btn-p">
            Send request on WhatsApp
          </button>
        }
      />
    </div>
  );
}
