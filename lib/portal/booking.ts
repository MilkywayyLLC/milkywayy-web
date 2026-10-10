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
  ["flexible", "Flexible"],
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
  /** Reels and long-form: a half-day or a full-day shoot (owner, 10 Oct 2026). */
  day?: "half" | "full";
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
  reels: "Agent / social reels",
  long_form: "Long-form walkthrough",
  property: "Property shoot",
};
export const SERVICE_HINT: Record<BookingService["service"], string> = {
  property: "Photos, videography and 360 tour for a listing, priced like the website",
  reels: "Vertical 9:16 walkthroughs and agent-presented videos",
  long_form: "Horizontal 16:9 walkthrough for YouTube",
};
export const DAY_LABEL = { half: "Half day", full: "Full day" } as const;

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
  const day = s.day ? ` · ${DAY_LABEL[s.day].toLowerCase()}` : "";
  return s.service === "reels"
    ? `${n} reel${n === 1 ? "" : "s"}${day}`
    : `${n} long-form video${n === 1 ? "" : "s"}${day}`;
}

/** The client's own rates (null where none is set), from my_booking_options. */
export type Rates = {
  reel: number | null;
  long_form: number | null;
  reel_shoot?: number | null;
  long_form_shoot?: number | null;
  half_day?: number | null;
  full_day?: number | null;
  avatar_short?: number | null;
  avatar_long?: number | null;
};

/** One line of an estimate; amount null when that rate isn't set (priced on confirmation). */
export type EstimateLine = {
  label: string;
  qty: number;
  unit: number | null;
  amount: number | null;
};

/** The estimate, line by line: the client's own rates, and the property price list. */
export function estimateLines(
  services: BookingService[],
  rates: Rates,
  pricing: PropertyPricing,
): EstimateLine[] {
  const out: EstimateLine[] = [];
  const line = (label: string, qty: number, unit: number | null | undefined) => {
    const u = unit == null ? null : Number(unit);
    out.push({ label, qty, unit: u, amount: u == null ? null : Math.round(u * qty * 100) / 100 });
  };
  for (const s of services) {
    if (s.service === "property" && s.property) {
      const amount = subtotal(asProperty(s.property, pricing), pricing);
      out.push({
        label: `Property shoot · ${propertyLabel(s.property, pricing)}`,
        qty: 1,
        unit: amount,
        amount,
      });
      continue;
    }
    const n = s.qty ?? 1;
    if (s.service === "reels")
      line("Reel, shot and edited", n, s.day ? rates.reel_shoot : rates.reel);
    else
      line("Long-form video, shot and edited", n, s.day ? rates.long_form_shoot : rates.long_form);
    if (s.day)
      line(
        s.day === "half" ? "Half-day shoot" : "Full-day shoot",
        1,
        rates[s.day === "half" ? "half_day" : "full_day"],
      );
  }
  return out;
}

/** The estimate total (lines without a rate left out). */
export function estimate(services: BookingService[], rates: Rates, pricing: PropertyPricing) {
  const t = estimateLines(services, rates, pricing).reduce((n, l) => n + (l.amount ?? 0), 0);
  return Math.round(t * 100) / 100;
}

/* ---------- AI avatar videos (owner, 10 Oct 2026) ---------- */

export const AVATAR_FORMATS = {
  short: {
    label: "Short form (Instagram reels, 9:16)",
    stops: [30, 60, 90, 120],
    unit: "s",
    def: 30,
  },
  long: { label: "Long form (YouTube, 16:9)", stops: [2, 5, 10, 15], unit: "min", def: 2 },
} as const;
export type AvatarFormat = keyof typeof AVATAR_FORMATS;
export const avatarLength = (f: AvatarFormat, n: number) => (f === "short" ? `${n}s` : `${n} min`);
/** The brief's kind in the database: 30s / 60s / 90s, else "longer". */
export const avatarKind = (f: AvatarFormat, n: number) =>
  f === "short" && n <= 90 ? `${n}s` : "longer";
/** Short form is priced per 30 seconds, long form per minute. */
export function avatarEstimate(f: AvatarFormat, n: number, rates: Rates | null) {
  const r = f === "short" ? rates?.avatar_short : rates?.avatar_long;
  if (r == null) return null;
  return Math.round(Number(r) * (f === "short" ? n / 30 : n) * 100) / 100;
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
  return services
    .map((s): LogLine => {
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
        ? {
            key: s.day ? "reel_shoot" : "reel",
            description: s.day ? "Reel, shot and edited" : "Social media reel",
            qty: s.qty ?? 1,
            basis: "client_rate",
          }
        : {
            key: s.day ? "long_form_shoot" : "long_form",
            description: s.day ? "Long-form video, shot and edited" : "YouTube long-form video",
            qty: s.qty ?? 1,
            basis: "client_rate",
          };
    })
    .flatMap((l, i): LogLine[] => {
      const d = services[i].day;
      return d
        ? [
            l,
            {
              key: d === "half" ? "half_day" : "full_day",
              description: d === "half" ? "Half-day shoot" : "Full-day shoot",
              qty: 1,
              basis: "client_rate",
            },
          ]
        : [l];
    });
}

/** What a log says was shot, as the booking's services (on-site changes follow the log). */
export function servicesFromLog(lines: LogLine[], before: BookingService[]): BookingService[] {
  const out: BookingService[] = [];
  const day = lines.some((l) => l.key === "full_day")
    ? "full"
    : lines.some((l) => l.key === "half_day")
      ? "half"
      : undefined;
  const count = (keys: string[]) =>
    lines.filter((l) => keys.includes(l.key)).reduce((n, l) => n + l.qty, 0);
  const keep = (k: BookingService["service"]) => before.find((s) => s.service === k);
  for (const l of lines)
    if (l.key === "property" && l.property) out.push({ service: "property", property: l.property });
  const reels = count(["reel", "reel_shoot"]);
  const longs = count(["long_form", "long_form_shoot"]);
  if (reels)
    out.push({ ...keep("reels"), service: "reels", qty: reels, day: day ?? keep("reels")?.day });
  if (longs)
    out.push({
      ...keep("long_form"),
      service: "long_form",
      qty: longs,
      day: day ?? keep("long_form")?.day,
    });
  return out;
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
    if (l.key === "reel" || l.key === "reel_shoot")
      for (let i = 0; i < l.qty; i++) out.push({ label: `Reel ${++reels}`, kind: "reel" });
    else if (l.key === "long_form" || l.key === "long_form_shoot")
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
