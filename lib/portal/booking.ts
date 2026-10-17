import type { PropertyPricing, TwilightQty } from "@/content/types";
import { AVATAR_FORMATS } from "./booking-labels";
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

/** Shot & edited (we film and edit) or Shoot only (raw files) (owner, 17 Oct 2026). */
export type ShootMode = "edited" | "raw";
export const MODE_LABEL: Record<ShootMode, string> = {
  edited: "Shot & edited",
  raw: "Shoot only (raw files)",
};

export type BookingService = {
  service: "reels" | "long_form" | "property";
  /** Absent on older bookings: shot & edited. */
  mode?: ShootMode;
  /** Shot & edited reels and long-form: how many videos. */
  qty?: number;
  /** Shoot only, reels and long-form: a half-day or a full-day shoot. (Older shot & edited
   *  bookings carry one too.) */
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
  /** Reverse-geocoded from the pin, editable (site-refine, Oct 2026). */
  building?: string;
  community?: string;
  unit?: string;
  access?: string;
};

export type PortalBooking = {
  location: BookingLocation;
  services: BookingService[];
  slot?: Slot;
  /** Preferred start time (HH:MM), scheduling only: we confirm the exact time. */
  start_time?: string;
  note?: string;
  estimate?: number | null;
};

// The labels live in a small module of their own: the website's dashboard previews import them
// without the booking logic (JS budget).
export { SERVICE_HINT, SERVICE_LABEL } from "./booking-labels";
export const DAY_LABEL = { half: "Half day", full: "Full day" } as const;
export const isRaw = (s: Pick<BookingService, "mode">) => s.mode === "raw";

/** The rate card key a booked service counts against (package inclusions, the price list). */
export function serviceKey(s: BookingService): string {
  if (s.service === "property") return isRaw(s) ? "prop_raw" : "shoot";
  if (isRaw(s)) return s.day === "full" ? "full_day" : "half_day";
  return s.service === "reels" ? "reel_shoot" : "long_form_shoot";
}

/**
 * The website price list with this client's own prices in it (owner, 17 Oct 2026): photos by
 * size, and flat videography, 360 tour and twilight (per image) prices where set. Everything
 * built on the price list (the property builder, subtotals, the shoot log) then uses them.
 */
export function clientPricing(pricing: PropertyPricing, rates: Rates | null): PropertyPricing {
  if (!rates) return pricing;
  const r = (k: string) => (rates[k] == null ? null : Number(rates[k]));
  const short = r("prop_short");
  const long = r("prop_long");
  const tour = r("prop_tour");
  const twi = r("prop_twilight");
  const sizes = (t: "apt" | "villa", list: PropertyPricing["apartment"]["sizes"]) =>
    list.map((z, i) => ({
      ...z,
      photo: r(`prop_photo_${t}_${i}`) ?? z.photo,
      short: short ?? z.short,
      long: long == null ? z.long : { day: long, night: long, dayNight: long },
      tour: tour ?? z.tour,
    }));
  const twTable = (t: Record<TwilightQty, number>) =>
    twi == null
      ? t
      : (Object.fromEntries(
          Object.keys(t).map((k) => [k, Math.round(Number(k) * twi * 100) / 100]),
        ) as Record<TwilightQty, number>);
  return {
    ...pricing,
    apartment: { ...pricing.apartment, sizes: sizes("apt", pricing.apartment.sizes) },
    villa: { ...pricing.villa, sizes: sizes("villa", pricing.villa.sizes) },
    twilight: {
      standard: twTable(pricing.twilight.standard),
      villa: twTable(pricing.twilight.villa),
    },
  };
}

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
  if (s.service === "property" && isRaw(s))
    return s.property
      ? `Shoot only (raw files) · ${propertyLabel(s.property, pricing)}`
      : "Shoot only (raw files)";
  if (s.service === "property" && s.property) return propertyLabel(s.property, pricing);
  if (isRaw(s)) return `Shoot only (raw files) · ${DAY_LABEL[s.day ?? "half"].toLowerCase()}`;
  const n = s.qty ?? 1;
  const day = s.day ? ` · ${DAY_LABEL[s.day].toLowerCase()}` : "";
  return s.service === "reels"
    ? `${n} reel${n === 1 ? "" : "s"}${day}`
    : `${n} long-form video${n === 1 ? "" : "s"}${day}`;
}

/** The client's own prices by rate card key (null where none is set), from my_booking_options. */
export type Rates = Record<string, number | null | undefined>;

/** What's left of each package inclusion this month, by key (package clients with price access). */
export type Left = Record<string, { qty: number; remaining: number }>;

/** One line of an estimate; amount null when that rate isn't set (priced on confirmation). */
export type EstimateLine = {
  /** The rate card key it counts against (package inclusions). */
  key?: string;
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
  const line = (key: string, label: string, qty: number, unit: number | null | undefined) => {
    const u = unit == null ? null : Number(unit);
    out.push({
      key,
      label,
      qty,
      unit: u,
      amount: u == null ? null : Math.round(u * qty * 100) / 100,
    });
  };
  for (const s of services) {
    const key = serviceKey(s);
    if (s.service === "property") {
      if (isRaw(s)) line(key, "Property shoot, shoot only (raw files)", 1, rates.prop_raw);
      else if (s.property) {
        const amount = subtotal(asProperty(s.property, pricing), pricing);
        out.push({
          key,
          label: `Property shoot · ${propertyLabel(s.property, pricing)}`,
          qty: 1,
          unit: amount,
          amount,
        });
      }
      continue;
    }
    if (isRaw(s))
      line(key, `Shoot only · ${DAY_LABEL[s.day ?? "half"].toLowerCase()}`, 1, rates[key]);
    else
      line(
        key,
        s.service === "reels" ? "Reel, shot & edited" : "Long-form, shot & edited",
        s.qty ?? 1,
        rates[key],
      );
  }
  return out;
}

/**
 * Package clients (owner, 17 Oct 2026): each line as Included (what's left of that inclusion this
 * month covers it) or Extra at the client's price; a line can be part of each. Amounts are the
 * extras only.
 */
export type PackageLine = EstimateLine & {
  included: number;
  left: number | null;
  total: number | null;
};
export function packageLines(lines: EstimateLine[], left: Left | null): PackageLine[] {
  const rem = Object.fromEntries(
    Object.entries(left ?? {}).map(([k, v]) => [k, Number(v.remaining)]),
  );
  return lines.map((l) => {
    const inc = l.key && l.key in rem ? Math.min(l.qty, Math.max(0, rem[l.key])) : 0;
    const before = l.key && l.key in rem ? rem[l.key] : null;
    if (l.key && l.key in rem) rem[l.key] -= inc;
    const extra = l.qty - inc;
    return {
      ...l,
      included: inc,
      left: before,
      total: l.key && left?.[l.key] ? Number(left[l.key].qty) : null,
      amount: l.unit == null ? (extra ? null : 0) : Math.round(l.unit * extra * 100) / 100,
    };
  });
}
/** "Included (5 of 8 left this month)", "Extra · AED 400", or both. */
export function packageLineText(l: PackageLine, money: (n: number) => string) {
  const inc = l.included > 0 ? `Included (${l.left} of ${l.total} left this month)` : "";
  const extra = l.qty - l.included;
  const ex =
    extra > 0
      ? `${l.included > 0 ? `${extra} extra` : "Extra"} · ${l.amount == null ? "priced on confirmation" : money(l.amount)}`
      : "";
  return [inc, ex].filter(Boolean).join(" + ");
}

/** The estimate total (lines without a rate left out). */
export function estimate(services: BookingService[], rates: Rates, pricing: PropertyPricing) {
  const t = estimateLines(services, rates, pricing).reduce((n, l) => n + (l.amount ?? 0), 0);
  return Math.round(t * 100) / 100;
}

/* ---------- AI avatar videos (owner, 10 Oct 2026) ---------- */

export { AVATAR_FORMATS };
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
      if (s.service === "property" && isRaw(s))
        return {
          key: "prop_raw",
          description: "Property shoot, shoot only (raw files)",
          qty: 1,
          basis: "client_rate",
        };
      if (isRaw(s)) {
        const d = s.day ?? "half";
        return {
          key: d === "half" ? "half_day" : "full_day",
          description: `Shoot only · ${DAY_LABEL[d].toLowerCase()} (${s.service === "reels" ? "reels" : "long-form"})`,
          qty: 1,
          basis: "client_rate",
        };
      }
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
      // Older shot & edited bookings had a day fee too; shoot-only lines are the day itself.
      const d = isRaw(services[i]) ? undefined : services[i].day;
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
    else if (l.key === "prop_raw")
      out.push({ ...keep("property"), service: "property", mode: "raw" });
  const reels = count(["reel", "reel_shoot"]);
  const longs = count(["long_form", "long_form_shoot"]);
  if (reels)
    out.push({ ...keep("reels"), service: "reels", mode: "edited", qty: reels, day: undefined });
  if (longs)
    out.push({
      ...keep("long_form"),
      service: "long_form",
      mode: "edited",
      qty: longs,
      day: undefined,
    });
  // A shoot-only day with no edited videos: the shoot-only booking it was.
  if (!reels && !longs && day) {
    const b = before.find((s) => s.service !== "property");
    out.push({ ...b, service: b?.service ?? "reels", mode: "raw", day, qty: undefined });
  }
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
    } else if (l.key === "prop_raw" || l.key === "half_day" || l.key === "full_day") {
      if (!out.some((d) => d.label === "Raw files"))
        out.push({ label: "Raw files", kind: "other" });
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
