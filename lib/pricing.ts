import type { PropertyPricing } from "@/content/types";

/** The lowest photography price across every property type: the "from AED X" figure. */
export function lowestShootPrice(p: PropertyPricing) {
  return Math.min(
    ...p.apartment.sizes.map((s) => s.photo),
    ...p.villa.sizes.map((s) => s.photo),
    ...p.commercial.tiers.map((t) => t.photo),
  );
}
