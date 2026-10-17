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
 * "Book a shoot" in the portal. One date, slot and location; then "What do you need?"
 * (site-refine, 18 Oct 2026): Photos (property type + size, Twilight and 360 tour as add-ons)
 * and/or Videos (short-form and long-form counters, or "Not sure how many?" → a half or full day,
 * optionally raw files only). Shared by the client form, the server action and the admin's
 * "Log what we shot". Older bookings (Shot & edited / Shoot only, videography by size) are read
 * through normalizeServices().
 */
export const SLOTS = [
  ["morning", "Morning"],
  ["afternoon", "Afternoon"],
  ["full_day", "Full day"],
] as const;
export type Slot = (typeof SLOTS)[number][0];
/** The preferred start times each slot allows (owner, 17 Oct 2026): quarter hours, inclusive. */
export const SLOT_HOURS: Record<Slot, [string, string]> = {
  morning: ["08:00", "12:45"],
  afternoon: ["13:00", "17:45"],
  full_day: ["08:00", "17:45"],
};
export const slotHours = (s: Slot | "" | undefined): [string, string] =>
  s ? SLOT_HOURS[s] : ["08:00", "17:45"];

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

/** Older bookings only: Shot & edited or Shoot only (raw files), for the whole booking. */
export type ShootMode = "edited" | "raw";

/** The Videos card. By count (the default) or by time ("Not sure how many?"). */
export type VideoPlan = {
  by: "count" | "time";
  /** Short-form (up to 60s) and long-form (up to 5 min): how many. By time: the finished count,
   *  once logged. */
  short?: number;
  long?: number;
  /** Long-form minutes beyond 5, all long-form videos together. */
  extra_min?: number;
  /** By time: a half day (morning or afternoon) or a full day. */
  day?: "half" | "full";
  /** By time only: raw files, no editing. */
  raw?: boolean;
  /** By time: an optional rough count ("about 4 reels and a walkthrough"). */
  approx?: string;
};

export type BookingService = {
  /** "property" is the Photos card; "videos" the Videos card. "reels" / "long_form" are older
   *  bookings only. */
  service: "property" | "videos" | "reels" | "long_form";
  videos?: VideoPlan;
  property?: PropertyConfig;
  /** Older bookings: */
  mode?: ShootMode;
  qty?: number;
  day?: "half" | "full";
  notes?: string;
  links?: string[];
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
export { SERVICE_HINT, SERVICE_LABEL, VIDEO_LABEL } from "./booking-labels";
export const DAY_LABEL = { half: "Half day", full: "Full day" } as const;
export const isRaw = (s: Pick<BookingService, "mode">) => s.mode === "raw";

/** Rate card keys (all client-overridable). */
export const KEY = {
  photos: "shoot",
  short: "reel_shoot",
  long: "long_form_shoot",
  extra: "long_form_extra_min",
  raw: { half: "half_day", full: "full_day" },
  min: { half: "min_half_day", full: "min_full_day" },
} as const;
/** What counts toward a flexible booking's minimum: the finished videos. */
export const VIDEO_KEYS: readonly string[] = [KEY.short, KEY.long, KEY.extra];
export const isMinimumKey = (k: string) => k === KEY.min.half || k === KEY.min.full;
/** Short-form is up to 60 seconds, long-form up to 5 minutes (then per extra minute). */
export const LONG_FORM_MINUTES = 5;

/** A property config with only the Photos parts (photos, twilight, 360 tour). */
export const photosOnly = (c: PropertyConfig): PropertyConfig => ({
  ...c,
  photo: true,
  video: false,
  short: false,
  long: false,
  lighting: "day",
});

const int = (n: unknown, max: number) => Math.max(0, Math.min(max, Math.round(Number(n) || 0)));

/**
 * Any booking's services in today's shape: at most one Photos service and one Videos service.
 * Older bookings: a property's videography becomes video counts; reels and long-form shot &
 * edited become counts (the old day fee is dropped); shoot only becomes raw files by time.
 */
export function normalizeServices(list: BookingService[]): BookingService[] {
  const out: BookingService[] = [];
  let v = null as VideoPlan | null;
  const byTime = () => (v as VideoPlan | null)?.by === "time";
  const notes: string[] = [];
  const links: string[] = [];
  const count = () => {
    if (!v) v = { by: "count" };
    return v;
  };
  const time = (day: "half" | "full" | undefined) => {
    const full = day === "full" || v?.day === "full";
    v = { by: "time", raw: true, day: full ? "full" : "half" };
  };
  for (const s of list ?? []) {
    if (s.service === "videos") {
      if (s.videos) out.push(s);
      continue;
    }
    if (s.notes) notes.push(s.notes);
    if (s.links?.length) links.push(...s.links);
    if (s.service === "property") {
      if (isRaw(s)) {
        time(undefined);
        continue;
      }
      const p = s.property;
      if (!p) continue;
      if (p.photo || p.tour) out.push({ service: "property", property: photosOnly(p) });
      if (p.video && (p.short || p.long) && !byTime()) {
        const c = count();
        if (p.short) c.short = (c.short ?? 0) + 1;
        if (p.long) c.long = (c.long ?? 0) + 1;
      }
      continue;
    }
    if (isRaw(s)) {
      time(s.day);
      continue;
    }
    if (byTime()) continue;
    const c = count();
    const n = Math.max(1, Math.round(s.qty ?? 1));
    if (s.service === "reels") c.short = (c.short ?? 0) + n;
    else c.long = (c.long ?? 0) + n;
  }
  if (v)
    out.push({
      service: "videos",
      videos: v,
      ...(notes.length ? { notes: notes.join("\n") } : {}),
      ...(links.length ? { links: links.slice(0, 5) } : {}),
    });
  // Photos first, then videos.
  return out.sort(
    (a, b) => (a.service === "property" ? 0 : 1) - (b.service === "property" ? 0 : 1),
  );
}

/** The Videos card as stored: whole numbers, by-time fields only by time. */
export function cleanVideos(v: VideoPlan): VideoPlan {
  if (v.by === "time")
    return {
      by: "time",
      day: v.day === "full" ? "full" : "half",
      ...(v.raw ? { raw: true } : {}),
      ...(v.approx?.trim() ? { approx: v.approx.trim().slice(0, 300) } : {}),
    };
  const long = int(v.long, 100);
  return {
    by: "count",
    ...(int(v.short, 100) ? { short: int(v.short, 100) } : {}),
    ...(long ? { long } : {}),
    ...(long && int(v.extra_min, 600) ? { extra_min: int(v.extra_min, 600) } : {}),
  };
}

/**
 * The website price list with this client's own prices in it (owner, 17 Oct 2026): photos by
 * size, and flat 360 tour and twilight (per image) prices where set.
 */
export function clientPricing(pricing: PropertyPricing, rates: Rates | null): PropertyPricing {
  if (!rates) return pricing;
  const r = (k: string) => (rates[k] == null ? null : Number(rates[k]));
  const tour = r("prop_tour");
  const twi = r("prop_twilight");
  const sizes = (t: "apt" | "villa", list: PropertyPricing["apartment"]["sizes"]) =>
    list.map((z, i) => ({
      ...z,
      photo: r(`prop_photo_${t}_${i}`) ?? z.photo,
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

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** "4 short-form · 1 long-form (+3 min)", "Half day · raw files only", "Full day, edited". */
export function videoSummary(v: VideoPlan): string {
  if (v.by === "time") {
    const day = DAY_LABEL[v.day ?? "half"];
    const head = v.raw ? `${day} · raw files only` : `${day}, edited`;
    const done = [
      v.short ? plural(v.short, "short-form") : "",
      v.long ? plural(v.long, "long-form") : "",
    ].filter(Boolean);
    return [head, done.length ? done.join(" · ") : v.approx ? `about: ${v.approx}` : ""]
      .filter(Boolean)
      .join(" · ");
  }
  const parts = [
    v.short ? plural(v.short, "short-form") : "",
    v.long ? `${plural(v.long, "long-form")}${v.extra_min ? ` (+${v.extra_min} min)` : ""}` : "",
  ].filter(Boolean);
  return parts.join(" · ") || "No videos yet";
}

/** One line, for the collapsed chip: "2 Bed apartment: Photography + 360° tour", "4 short-form". */
export function serviceSummary(s: BookingService, pricing: PropertyPricing) {
  if (s.service === "videos" && s.videos) return videoSummary(s.videos);
  if (s.service === "property" && isRaw(s))
    return s.property
      ? `Shoot only (raw files) · ${propertyLabel(s.property, pricing)}`
      : "Shoot only (raw files)";
  if (s.service === "property" && s.property) return propertyLabel(s.property, pricing);
  // Older bookings.
  if (isRaw(s)) {
    const approx = s.qty ? ` · about ${s.qty}` : "";
    return `Shoot only (raw files) · ${DAY_LABEL[s.day ?? "half"].toLowerCase()}${approx}`;
  }
  const n = s.qty ?? 1;
  const day = s.day ? ` · ${DAY_LABEL[s.day].toLowerCase()}` : "";
  return s.service === "reels"
    ? `${n} reel${n === 1 ? "" : "s"}${day}`
    : `${n} long-form video${n === 1 ? "" : "s"}${day}`;
}

/** Without the price list (the client's shoot page), after the service's label: "" for photos,
 *  "4 short-form · 1 long-form" for videos. */
export function serviceShort(s: BookingService) {
  if (s.service === "videos" && s.videos) return videoSummary(s.videos);
  if (s.service === "property") return isRaw(s) ? "Shoot only (raw files)" : "";
  return `${s.service === "reels" ? "Reels" : "Long-form"} (${s.qty ?? 1})`;
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
  /** A flexible booking's minimum: billed per finished video, or this if that's less. */
  minimum?: boolean;
};

/** The Videos card's estimate lines. */
export function videoLines(v: VideoPlan, rates: Rates): EstimateLine[] {
  const out: EstimateLine[] = [];
  const line = (key: string, label: string, qty: number, minimum?: boolean) => {
    const u = rates[key] == null ? null : Number(rates[key]);
    out.push({
      key,
      label,
      qty,
      unit: u,
      amount: u == null ? null : Math.round(u * qty * 100) / 100,
      ...(minimum ? { minimum } : {}),
    });
  };
  const day = v.day === "full" ? "full" : "half";
  if (v.by === "time") {
    if (v.raw) line(KEY.raw[day], `Raw files only · ${DAY_LABEL[day].toLowerCase()}`, 1);
    else line(KEY.min[day], `${DAY_LABEL[day]}, edited · minimum`, 1, true);
    return out;
  }
  if (v.short) line(KEY.short, "Short-form video (up to 60s)", v.short);
  if (v.long) line(KEY.long, `Long-form video (up to ${LONG_FORM_MINUTES} min)`, v.long);
  if (v.long && v.extra_min) line(KEY.extra, "Long-form, extra minutes", v.extra_min);
  return out;
}

/** The estimate, line by line: the client's own rates, and the property price list. */
export function estimateLines(
  services: BookingService[],
  rates: Rates,
  pricing: PropertyPricing,
): EstimateLine[] {
  const out: EstimateLine[] = [];
  for (const s of normalizeServices(services)) {
    if (s.service === "property" && s.property) {
      const amount = subtotal(asProperty(s.property, pricing), pricing);
      out.push({
        key: KEY.photos,
        label: `Photos · ${propertyLabel(s.property, pricing)}`,
        qty: 1,
        unit: amount,
        amount,
      });
    } else if (s.service === "videos" && s.videos) out.push(...videoLines(s.videos, rates));
  }
  return out;
}

/**
 * Package clients (owner, 17 Oct 2026): each line as Included (what's left of that inclusion this
 * month covers it) or Extra at the client's price; a line can be part of each. Amounts are the
 * extras only. A flexible booking's minimum doesn't apply on a package: its videos draw from the
 * inclusions as they're delivered.
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
    if (l.minimum)
      return {
        ...l,
        label: l.label.replace(" · minimum", ""),
        included: 0,
        left: null,
        total: null,
        amount: 0,
      };
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
  if (l.minimum) return "Per finished video, from your package";
  const inc = l.included > 0 ? `Included (${l.left} of ${l.total} left this month)` : "";
  const extra = l.qty - l.included;
  const ex =
    extra > 0
      ? `${l.included > 0 ? `${extra} extra` : "Extra"} · ${l.amount == null ? "priced on confirmation" : money(l.amount)}`
      : "";
  return [inc, ex].filter(Boolean).join(" + ");
}

/** The estimate total (lines without a rate left out). A flexible booking counts its minimum. */
export function estimate(services: BookingService[], rates: Rates, pricing: PropertyPricing) {
  const t = estimateLines(services, rates, pricing).reduce((n, l) => n + (l.amount ?? 0), 0);
  return Math.round(t * 100) / 100;
}

/**
 * A flexible edited booking (by time, not raw): billed per finished video at the client's rates,
 * or the half/full-day minimum if that's higher. The top-up is the difference (0 when the videos
 * cover it). No minimum on a monthly package. The database applies the same rule when the shoot
 * is logged (portal_admin_log_shoot).
 */
export function minimumTopUp(
  lines: { key: string; qty: number; unit: number | null | undefined }[],
  minimum: number | null | undefined,
  onPackage: boolean,
): number {
  if (onPackage || minimum == null) return 0;
  const videos = lines
    .filter((l) => VIDEO_KEYS.includes(l.key))
    .reduce((n, l) => n + Number(l.unit ?? 0) * l.qty, 0);
  return Math.max(0, Math.round((Number(minimum) - videos) * 100) / 100);
}

/* ---------- AI avatar videos (owner, 10 Oct 2026) ---------- */

export { AVATAR_FORMATS };
export type AvatarFormat = keyof typeof AVATAR_FORMATS;
export const avatarLength = (f: AvatarFormat, n: number) =>
  f === "short" ? `up to ${n} seconds` : `${n} min`;
/** The brief's kind in the database: "30s" for short form, "longer" (per minute) for long form. */
export const avatarKind = (f: AvatarFormat, n: number) =>
  f === "short" && n <= 30 ? "30s" : "longer";
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
  /** A flexible booking's minimum (min_half_day / min_full_day): not an item of its own; the
   *  database adds a top-up when the videos come to less. */
  minimum?: boolean;
};

/** Prefilled from what the client asked for. */
export function logPrefill(services: BookingService[], pricing: PropertyPricing): LogLine[] {
  const out: LogLine[] = [];
  const rate = (key: string, description: string, qty: number, minimum?: boolean): LogLine => ({
    key,
    description,
    qty,
    basis: "client_rate",
    ...(minimum ? { minimum } : {}),
  });
  for (const s of normalizeServices(services)) {
    if (s.service === "property" && s.property) {
      const p = asProperty(s.property, pricing);
      out.push({
        key: "property",
        kind: "shoot",
        description: `Photo shoot · ${propertyLabel(s.property, pricing)}`,
        qty: 1,
        basis: "price_list",
        unit_price: subtotal(p, pricing),
        property: s.property,
      });
      continue;
    }
    const v = s.videos;
    if (!v) continue;
    const day = v.day === "full" ? "full" : "half";
    if (v.by === "time" && v.raw) {
      out.push(rate(KEY.raw[day], `Raw files only · ${DAY_LABEL[day].toLowerCase()}`, 1));
      continue;
    }
    if (v.by === "time") {
      // Billed per finished video: set the counts once they're delivered.
      out.push(rate(KEY.short, "Short-form video (up to 60s)", Math.max(1, v.short ?? 1)));
      if (v.long) out.push(rate(KEY.long, "Long-form video (up to 5 min)", v.long));
      out.push(rate(KEY.min[day], `Minimum · ${DAY_LABEL[day].toLowerCase()}, edited`, 1, true));
      continue;
    }
    if (v.short) out.push(rate(KEY.short, "Short-form video (up to 60s)", v.short));
    if (v.long) out.push(rate(KEY.long, "Long-form video (up to 5 min)", v.long));
    if (v.long && v.extra_min) out.push(rate(KEY.extra, "Long-form, extra minutes", v.extra_min));
  }
  return out;
}

/** What a log says was shot, as the booking's services (on-site changes follow the log). */
export function servicesFromLog(lines: LogLine[], before: BookingService[]): BookingService[] {
  const prior = normalizeServices(before);
  const keepV = prior.find((s) => s.service === "videos");
  const out: BookingService[] = [];
  const count = (keys: string[]) =>
    lines.filter((l) => keys.includes(l.key)).reduce((n, l) => n + l.qty, 0);
  for (const l of lines)
    if (l.key === "property" && l.property)
      out.push({ service: "property", property: photosOnly(l.property) });
  const short = count([KEY.short, "reel"]);
  const long = count([KEY.long, "long_form"]);
  const extra = count([KEY.extra]);
  const min = lines.find((l) => l.minimum || isMinimumKey(l.key));
  const raw = lines.find(
    (l) => l.key === KEY.raw.half || l.key === KEY.raw.full || l.key === "prop_raw",
  );
  let v: VideoPlan | null = null;
  if (min)
    v = {
      by: "time",
      day: min.key === KEY.min.full ? "full" : "half",
      ...(short ? { short } : {}),
      ...(long ? { long } : {}),
      ...(keepV?.videos?.approx ? { approx: keepV.videos.approx } : {}),
    };
  else if (raw && !short && !long)
    v = { by: "time", raw: true, day: raw.key === KEY.raw.full ? "full" : "half" };
  else if (short || long)
    v = {
      by: "count",
      ...(short ? { short } : {}),
      ...(long ? { long } : {}),
      ...(long && extra ? { extra_min: extra } : {}),
    };
  if (v)
    out.push({
      ...(keepV ? { notes: keepV.notes, links: keepV.links } : {}),
      service: "videos",
      videos: v,
    });
  return out.map((s) => JSON.parse(JSON.stringify(s)) as BookingService);
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
    if (l.minimum || isMinimumKey(l.key) || l.key === KEY.extra) continue;
    if (l.key === "reel" || l.key === KEY.short)
      for (let i = 0; i < l.qty; i++) out.push({ label: `Reel ${++reels}`, kind: "reel" });
    else if (l.key === "long_form" || l.key === KEY.long)
      for (let i = 0; i < l.qty; i++)
        out.push({ label: `Long-form ${++longs}`, kind: "long_form" });
    else if (l.key === "property" && l.property) {
      if (l.property.photo) out.push({ label: "Photos", kind: "photos" });
      // Older property lines with videography.
      if (l.property.video && l.property.short)
        out.push({ label: `Reel ${++reels}`, kind: "reel" });
      if (l.property.video && l.property.long)
        out.push({ label: `Long-form ${++longs}`, kind: "long_form" });
      if (l.property.tour) out.push({ label: "360 tour", kind: "tour" });
    } else if (l.key === "prop_raw" || l.key === KEY.raw.half || l.key === KEY.raw.full) {
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
