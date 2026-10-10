import type { PropertyPricing } from "@/content/types";
import {
  normalize,
  servicesText,
  subtotal,
  title as propertyTitle,
  type BookingProperty,
} from "@/lib/booking";

/**
 * "Book a shoot" in the portal (owner, 10 Oct 2026): one date, slot and location; services added
 * one at a time (social media reels, YouTube long-form, a property shoot built like the website's
 * booking). Shared by the client form, the server action and the admin's "Log what we shot".
 */
export const SLOTS = [
  ["morning", "Morning"],
  ["afternoon", "Afternoon"],
  ["full_day", "Full day"],
] as const;
export type Slot = (typeof SLOTS)[number][0];

export type PropertyConfig = Pick<
  BookingProperty,
  | "type"
  | "size"
  | "photo"
  | "twilight"
  | "twilightQty"
  | "video"
  | "short"
  | "long"
  | "lighting"
  | "tour"
>;

export type BookingService = {
  service: "reels" | "long_form" | "property";
  qty?: number;
  notes?: string;
  links?: string[];
  property?: PropertyConfig;
};

export type BookingLocation = {
  address: string;
  lat?: number;
  lng?: number;
  place_id?: string;
  unit?: string;
  access?: string;
};

export type PortalBooking = {
  location: BookingLocation;
  services: BookingService[];
  slot?: Slot;
  note?: string;
  estimate?: number | null;
};

export const SERVICE_LABEL: Record<BookingService["service"], string> = {
  reels: "Social media reels",
  long_form: "YouTube long-form",
  property: "Property shoot",
};

/** The property config as the website builder's state (no location or date of its own). */
export function asProperty(c: PropertyConfig, pricing: PropertyPricing): BookingProperty {
  return normalize({ ...c, id: 1, area: "", building: "", unit: "", date: "", slot: "" }, pricing);
}

export const propertyLabel = (c: PropertyConfig, pricing: PropertyPricing) => {
  const p = asProperty(c, pricing);
  const what = servicesText(p).join(" + ");
  return `${propertyTitle(p, pricing)}${what ? `: ${what}` : ""}`;
};

/** One line, for the collapsed chip: "4 reels · notes", "2BR apartment: photos + reel". */
export function serviceSummary(s: BookingService, pricing: PropertyPricing) {
  if (s.service === "property" && s.property) return propertyLabel(s.property, pricing);
  const n = s.qty ?? 1;
  return s.service === "reels"
    ? `${n} reel${n === 1 ? "" : "s"}`
    : `${n} long-form video${n === 1 ? "" : "s"}`;
}

export type Rates = { reel: number | null; long_form: number | null };

/** The live estimate from the client's own rates and the property price list. */
export function estimate(services: BookingService[], rates: Rates, pricing: PropertyPricing) {
  let total = 0;
  for (const s of services) {
    if (s.service === "property" && s.property)
      total += subtotal(asProperty(s.property, pricing), pricing);
    else if (s.service === "reels") total += (s.qty ?? 0) * Number(rates.reel ?? 0);
    else if (s.service === "long_form") total += (s.qty ?? 0) * Number(rates.long_form ?? 0);
  }
  return Math.round(total * 100) / 100;
}

/* ---------- Log what we shot ---------- */

export type LogLine = {
  /** A rate card key (client's rate) or "property" (the global price list). */
  key: string;
  kind?: string;
  description: string;
  qty: number;
  basis: "client_rate" | "price_list" | "override";
  unit_price?: number;
  list_price?: number;
  reason?: string;
  /** Property lines: the configuration they were priced from. */
  property?: PropertyConfig;
};

/** Prefilled from what the client asked for. */
export function logPrefill(services: BookingService[], pricing: PropertyPricing): LogLine[] {
  return services.map((s): LogLine => {
    if (s.service === "property" && s.property) {
      const p = asProperty(s.property, pricing);
      return {
        key: "property",
        kind: "shoot",
        description: `Property shoot · ${propertyLabel(s.property, pricing)}`,
        qty: 1,
        basis: "price_list",
        unit_price: subtotal(p, pricing),
        property: s.property,
      };
    }
    return s.service === "reels"
      ? { key: "reel", description: "Social media reel", qty: s.qty ?? 1, basis: "client_rate" }
      : {
          key: "long_form",
          description: "YouTube long-form video",
          qty: s.qty ?? 1,
          basis: "client_rate",
        };
  });
}

export type DeliverableDraft = {
  label: string;
  kind: "reel" | "long_form" | "photos" | "tour" | "video" | "other";
};

/** The first deliverables list, from the log: Reel 1…n, Long-form 1…n, Photos, 360 tour… */
export function deliverablesFrom(lines: LogLine[]): DeliverableDraft[] {
  const out: DeliverableDraft[] = [];
  let reels = 0;
  let longs = 0;
  for (const l of lines) {
    if (l.key === "reel")
      for (let i = 0; i < l.qty; i++) out.push({ label: `Reel ${++reels}`, kind: "reel" });
    else if (l.key === "long_form")
      for (let i = 0; i < l.qty; i++)
        out.push({ label: `Long-form ${++longs}`, kind: "long_form" });
    else if (l.key === "property" && l.property) {
      if (l.property.photo) out.push({ label: "Photos", kind: "photos" });
      if (l.property.video && l.property.short)
        out.push({ label: `Reel ${++reels}`, kind: "reel" });
      if (l.property.video && l.property.long)
        out.push({ label: `Long-form ${++longs}`, kind: "long_form" });
      if (l.property.tour) out.push({ label: "360 tour", kind: "tour" });
    } else if (l.key === "photo")
      out.push({ label: l.description.trim().slice(0, 80) || "Photos", kind: "photos" });
  }
  return out;
}

export const DELIVERABLE_STATUS = {
  editing: "Editing",
  delivered: "Delivered",
  in_revision: "In revision",
  approved: "Approved",
} as const;
export type DeliverableStatus = keyof typeof DELIVERABLE_STATUS;
export type Deliverable = {
  id: string;
  project_id: string;
  label: string;
  kind: DeliverableDraft["kind"];
  status: DeliverableStatus;
  rounds_allowed: number;
  rounds_used: number;
  link_url: string | null;
  sort: number;
  delivered_at: string | null;
};
