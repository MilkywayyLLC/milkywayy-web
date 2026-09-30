import type { PropertyPricing } from "@/content/types";
import { formatNumber } from "@/lib/format";

/**
 * Starting prices for single property shoots, all read from the pricing config (so an admin price
 * change updates them). The full calculator lives on /book.
 */
export function PriceOverview({ pricing }: { pricing: PropertyPricing }) {
  const minOf = (xs: (number | null)[]) => Math.min(...(xs.filter((x) => x !== null) as number[]));
  const apt = pricing.apartment.sizes;
  const villa = pricing.villa.sizes;
  const com = pricing.commercial.tiers;
  const all = [...apt, ...villa];
  const items = [
    {
      k: "Apartment photos",
      from: minOf(apt.map((s) => s.photo)),
      note: `${apt[0].label} to ${apt[apt.length - 1].label} · delivered in ${pricing.delivery.photo}`,
    },
    {
      k: "Villa / townhouse photos",
      from: minOf(villa.map((s) => s.photo)),
      note: `${villa[0].label} to ${villa[villa.length - 1].label}`,
    },
    {
      k: "Short-form video",
      from: minOf([...all.map((s) => s.short), ...com.map((t) => t.short)]),
      note: `Social media reels · ${pricing.delivery.short}`,
    },
    {
      k: "Long-form walkthrough",
      from: minOf([...all.map((s) => s.long.day), ...com.map((t) => t.long)]),
      note: "Daylight, night, or day + night",
    },
    {
      k: "360° tour",
      from: minOf([...all.map((s) => s.tour), ...com.map((t) => t.tour)]),
      note: `Delivered in ${pricing.delivery.tour}`,
    },
    {
      k: "Commercial",
      from: minOf(com.map((t) => t.photo)),
      note: `${com.map((t) => t.label).join(", ")} tiers`,
    },
  ];
  const twilight = pricing.twilight.standard[5];

  return (
    <>
      <div className="incl prices">
        {items.map((i) => (
          <div key={i.k}>
            <span className="k">{i.k}</span>
            <span className="pr">
              <small>From</small>AED {formatNumber(i.from)}
            </span>
            <p>{i.note}</p>
          </div>
        ))}
      </div>
      <p className="tnote">
        Twilight add-on from AED {formatNumber(twilight)} for 5 images. Shooting several properties
        on the same day? We&apos;ll send a better price for the whole booking.
      </p>
    </>
  );
}
