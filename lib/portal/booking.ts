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

/** The Videos card. By count (property shoots), by length (content shoots, 25 Oct 2026: 2, 4 or
 *  8 hours plus edits) or by time (older content bookings: "Not sure how many?"). */
export type VideoPlan = {
  by: "count" | "time" | "hours";
  /** By length: the shoot length in hours. */
  hours?: ContentHours;
  /** Short-form (30–90 sec) and long-form (up to 5 min): how many. By time: the finished count,
   *  once logged. */
  short?: number;
  long?: number;
  /** Long-form minutes beyond 5, all long-form videos together. */
  extra_min?: number;
  /** By length, v2 (28 Oct 2026): each long-form edit's length in minutes (5–30, 5-min steps). */
  longs?: number[];
  /** By length: 2 = today's pricing (shoot only + edits by quantity, long-form by length). */
  v?: 2;
  /** By length, v2: the prices it was booked at (set by the server, never the browser). */
  priced?: ContentPrices;
  /** By time: a half day (morning or afternoon) or a full day. */
  day?: "half" | "full";
  /** By time or by length: raw files, no editing. */
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
/** Content shoot by length (owner, 25 Oct 2026; pricing v2, 28 Oct 2026): three lengths, shoot
 *  only (raw), edits added by quantity, nothing included. */
export const CONTENT_HOURS = [2, 4, 8] as const;
export type ContentHours = (typeof CONTENT_HOURS)[number];
export const CONTENT_KEY = {
  2: "content_2h",
  4: "content_4h",
  8: "content_8h",
  short: "content_short_edit",
  /** Older bookings (before v2): a flat price per long-form edit. */
  long: "content_long_edit",
  /** Per extra hour beyond the booked length. */
  overtime: "content_overtime",
} as const;
/** Long-form lengths (minutes): one per-minute rate per length, applied to every minute. Longer
 *  than 30 minutes is a custom quote. */
export const LONG_LENGTHS = [5, 10, 15, 20, 25, 30] as const;
export type LongLength = (typeof LONG_LENGTHS)[number];
export const longKey = (min: number) => `content_long_${min}`;
/** Edit only (you send the files): long-form at the same table plus this, short-form at `reel`. */
export const EDIT_LONG_EXTRA = "edit_long_extra";
export const isLongLength = (n: unknown): n is LongLength =>
  LONG_LENGTHS.includes(Number(n) as LongLength);
/** A finished length rounds up to the next 5-minute step; null above 30 (custom quote). */
export const roundUpLength = (min: number): LongLength | null => {
  const m = Math.max(5, Math.ceil((Number(min) || 0) / 5) * 5);
  return isLongLength(m) ? m : null;
};
/** Half-days a content shoot uses on a value package: 2 h a quarter day, 4 h a half, 8 h a full. */
export const CONTENT_HALF_DAYS: Record<ContentHours, number> = { 2: 0.5, 4: 1, 8: 2 };
/** Older bookings: up to 3 long-form edits; v2: up to 10, each with its length. */
export const CONTENT_LONG_MAX = 3;
export const CONTENT_LONG_MAX_V2 = 10;
/** Capacity check at booking: a short-form edit takes 1 hour of shooting, a long-form 2. */
export const SHOOT_HOURS_PER = { short: 1, long: 2 } as const;
export const isContentHours = (n: unknown): n is ContentHours =>
  CONTENT_HOURS.includes(Number(n) as ContentHours);

/** The prices a v2 content shoot was booked at (client's rates on the day). */
export type ContentPrices = {
  shoot: number | null;
  short: number | null;
  /** Per-minute rate by length. */
  long: Partial<Record<LongLength, number | null>>;
  overtime: number | null;
};
const num = (x: unknown) => (x == null || x === "" ? null : Number(x));
export function contentPrices(rates: Rates, hours: ContentHours): ContentPrices {
  return {
    shoot: num(rates[CONTENT_KEY[hours]]),
    short: num(rates[CONTENT_KEY.short]),
    long: Object.fromEntries(LONG_LENGTHS.map((m) => [m, num(rates[longKey(m)])])),
    overtime: num(rates[CONTENT_KEY.overtime]),
  };
}
/** One long-form edit: its length × that length's per-minute rate (null when unset). */
export const longPrice = (min: number, perMin: number | null | undefined) =>
  perMin == null ? null : Math.round(Number(perMin) * min * 100) / 100;
/** Edit only, long-form: the same table plus the edit-only add-on. */
export function editLongPrice(min: number, rates: Rates | null | undefined) {
  const base = longPrice(min, num(rates?.[longKey(min)]));
  return base == null ? null : base + (num(rates?.[EDIT_LONG_EXTRA]) ?? 0);
}
/** An edit-only request (28 Oct 2026): short-form count, each long-form's length, listing batches. */
export type EditItems = {
  short: number;
  longs: number[];
  listings: { name: string; count: number }[];
};
export const EDIT_LISTING_MAX = 10;
/** The request's lines at the client's rates (reel, long-form by length + add-on, photo per image).
 *  `unit`/`amount` are null while a rate is missing. */
export function editItemLines(items: EditItems, rates: Rates | null | undefined): EstimateLine[] {
  const out: EstimateLine[] = [];
  const row = (key: string, label: string, qty: number, unit: number | null, sub?: string) =>
    out.push({
      key,
      label,
      qty,
      unit,
      amount: unit == null ? null : Math.round(unit * qty * 100) / 100,
      ...(sub ? { sub } : {}),
    });
  if (items.short > 0)
    row("reel", "Short-form edits", items.short, num(rates?.reel), "Up to 60 sec");
  const byLen = new Map<number, number>();
  for (const m of items.longs) byLen.set(m, (byLen.get(m) ?? 0) + 1);
  for (const [m, n] of [...byLen].sort((a, b) => a[0] - b[0]))
    row(
      "long_form",
      `Long-form edit · ${m} min`,
      n,
      editLongPrice(m, rates),
      `${n > 1 ? `${n} × ` : ""}${m} min`,
    );
  items.listings.forEach((l, i) =>
    row(
      "photo",
      `${l.name.trim() || `Listing ${i + 1}`} · ${l.count} photo${l.count === 1 ? "" : "s"}`,
      l.count,
      num(rates?.photo),
      "Listing photos · HDR",
    ),
  );
  return out;
}

/** Hours of shooting the edits need (1 per short-form, 2 per long-form). */
export const hoursNeeded = (short: number, longs: number) =>
  short * SHOOT_HOURS_PER.short + longs * SHOOT_HOURS_PER.long;

/** What counts toward a flexible booking's minimum: the finished videos. */
export const VIDEO_KEYS: readonly string[] = [KEY.short, KEY.long, KEY.extra];
export const isMinimumKey = (k: string) => k === KEY.min.half || k === KEY.min.full;
/** Short-form is up to 60 seconds, long-form up to 5 minutes (then per extra minute). */
export const LONG_FORM_MINUTES = 10;

/** A property config with only the Photos parts (photos, twilight, 360 tour). A 360° tour can be
 *  booked on its own (owner, 18 Oct 2026); with neither, photography is on. */
export const photosOnly = (c: PropertyConfig): PropertyConfig => ({
  ...c,
  photo: !!c.photo || !c.tour,
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
  if (v.by === "hours") {
    const hours = isContentHours(v.hours) ? (Number(v.hours) as ContentHours) : 4;
    if (v.v === 2) {
      // v2: shoot only unless edits are added; no edits = the raw files.
      const short = int(v.short, 100);
      const longs = (v.longs ?? []).filter(isLongLength).slice(0, CONTENT_LONG_MAX_V2);
      return {
        by: "hours",
        v: 2,
        hours,
        ...(short ? { short } : {}),
        ...(longs.length ? { long: longs.length, longs: longs.map(Number) } : {}),
        ...(v.raw || (!short && !longs.length) ? { raw: true } : {}),
        ...(v.priced ? { priced: v.priced } : {}),
      };
    }
    if (v.raw) return { by: "hours", hours, raw: true };
    const short = int(v.short, 100);
    const long = int(v.long, CONTENT_LONG_MAX);
    return { by: "hours", hours, ...(short ? { short } : {}), ...(long ? { long } : {}) };
  }
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
  if (v.by === "hours") {
    const head = `${v.hours ?? 4} h content shoot`;
    if (v.raw) return `${head} · raw files only`;
    const edits = [
      v.short ? plural(v.short, "short-form edit") : "",
      v.long
        ? `${plural(v.long, "long-form edit")}${v.longs?.length ? ` (${v.longs.join(", ")} min)` : ""}`
        : "",
    ].filter(Boolean);
    return [head, edits.join(" · ") || "no edits"].join(" · ");
  }
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
  /** A small grey line under it (edit-only requests). */
  sub?: string;
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
  if (v.by === "hours" && v.v === 2) {
    const h = isContentHours(v.hours) ? (Number(v.hours) as ContentHours) : 4;
    // The frozen prices once booked, else the client's rates now.
    const p = v.priced ?? contentPrices(rates, h);
    const fixed = (key: string, label: string, qty: number, unit: number | null) =>
      out.push({
        key,
        label,
        qty,
        unit,
        amount: unit == null ? null : Math.round(unit * qty * 100) / 100,
      });
    fixed(CONTENT_KEY[h], `Content shoot · ${h} hours (raw files)`, 1, p.shoot);
    if (v.short) fixed(CONTENT_KEY.short, "Short-form edit (up to 60 sec)", v.short, p.short);
    // Long-form grouped by length: "Long-form edit · 10 min" × 2.
    const byLen = new Map<number, number>();
    for (const m of v.longs ?? []) byLen.set(m, (byLen.get(m) ?? 0) + 1);
    for (const [m, n] of [...byLen].sort((a, b) => a[0] - b[0]))
      fixed(longKey(m), `Long-form edit · ${m} min`, n, longPrice(m, p.long[m as LongLength]));
    return out;
  }
  if (v.by === "hours") {
    const h = isContentHours(v.hours) ? (Number(v.hours) as ContentHours) : 4;
    line(CONTENT_KEY[h], `Content shoot · ${h} hours${v.raw ? " · raw files" : ""}`, 1);
    if (!v.raw && v.short) line(CONTENT_KEY.short, "Short-form edit", v.short);
    if (!v.raw && v.long) line(CONTENT_KEY.long, "Long-form edit", v.long);
    return out;
  }
  const day = v.day === "full" ? "full" : "half";
  if (v.by === "time") {
    if (v.raw) line(KEY.raw[day], `Raw files only · ${DAY_LABEL[day].toLowerCase()}`, 1);
    else line(KEY.min[day], `${DAY_LABEL[day]}, edited · minimum`, 1, true);
    return out;
  }
  if (v.short) line(KEY.short, "Short-form video (30–90 sec)", v.short);
  if (v.long) line(KEY.long, `Long-form walkthrough (up to ${LONG_FORM_MINUTES} min)`, v.long);
  if (v.long && v.extra_min) line(KEY.extra, "Walkthrough, extra minutes", v.extra_min);
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

/* ---------- content shoot v2: summary, capacity, confirm what we shot (28 Oct 2026) ---------- */

const fmtN = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 2 });
const hoursText = (h: number) => `${fmtN(h)}h`;

/** "4h shoot 900 + 4 short × 150 + 1 long (10 min) 750 = AED 2,250 · ≈ 450 per video"; null while
 *  a price is missing. */
export function contentSummary(v: VideoPlan, p: ContentPrices, currency: string): string | null {
  if (v.by !== "hours" || p.shoot == null) return null;
  const parts = [`${v.hours}h shoot ${fmtN(p.shoot)}`];
  let total = p.shoot;
  const short = v.short ?? 0;
  const longs = v.longs ?? [];
  if (short) {
    if (p.short == null) return null;
    parts.push(`${short} short × ${fmtN(p.short)}`);
    total += short * p.short;
  }
  if (longs.length) {
    let sum = 0;
    for (const m of longs) {
      const x = longPrice(m, p.long[m as LongLength]);
      if (x == null) return null;
      sum += x;
    }
    parts.push(
      `${longs.length} long (${[...longs].sort((a, b) => a - b).join(", ")} min) ${fmtN(sum)}`,
    );
    total += sum;
  }
  const videos = short + longs.length;
  return `${parts.join(" + ")} = ${currency} ${fmtN(total)}${
    videos ? ` · ≈ ${fmtN(Math.round(total / videos))} per video` : ""
  }`;
}

/** What was booked or shot, for "Confirm what we shot": hours in 1-hour steps. */
export type ShotPlan = {
  hours: number;
  short: number;
  /** Each long-form edit's length (5-minute steps up to 30). */
  longs: number[];
  raw: boolean;
  /** Anything else (a custom quote, e.g. long-form over 30 min). Actual only. */
  extra?: { description: string; amount: number } | null;
};
/** A line on the confirmation: what differs (negative = credit). */
export type AdjustLine = { description: string; qty: number; unit_price: number; kind?: "credit" };
/** The actual, priced: the project's line items. */
export type ConfirmItem = { key: string; description: string; qty: number; unit_price: number };

export const bookedShot = (v: VideoPlan): ShotPlan => ({
  hours: Number(v.hours ?? 4),
  short: v.short ?? 0,
  longs: [...(v.longs ?? [])],
  raw: !!v.raw,
});

/** Overtime in whole hours beyond the booked length. */
export const overtimeSteps = (booked: number, actual: number) =>
  Math.max(0, Math.ceil(actual - booked - 1e-9));

/** The actual, priced at the booking's prices. Throws on a missing price. */
export function shotItems(actual: ShotPlan, booked: ShotPlan, p: ContentPrices): ConfirmItem[] {
  const need = (n: number | null | undefined, what: string) => {
    if (n == null) throw new Error(`No price for ${what}: set it in Prices & packages.`);
    return Number(n);
  };
  const h = isContentHours(booked.hours) ? (booked.hours as ContentHours) : 4;
  const out: ConfirmItem[] = [
    {
      key: CONTENT_KEY[h],
      description: `Content shoot · ${h} hours (raw files)`,
      qty: 1,
      unit_price: need(p.shoot, "the shoot"),
    },
  ];
  const steps = overtimeSteps(booked.hours, actual.hours);
  if (steps)
    out.push({
      key: CONTENT_KEY.overtime,
      description: "Overtime · per extra hour",
      qty: steps,
      unit_price: need(p.overtime, "overtime"),
    });
  if (actual.short)
    out.push({
      key: CONTENT_KEY.short,
      description: "Short-form edit (up to 60 sec)",
      qty: actual.short,
      unit_price: need(p.short, "short-form edits"),
    });
  const byLen = new Map<number, number>();
  for (const m of actual.longs) byLen.set(m, (byLen.get(m) ?? 0) + 1);
  for (const [m, n] of [...byLen].sort((a, b) => a[0] - b[0]))
    out.push({
      key: longKey(m),
      description: `Long-form edit · ${m} min`,
      qty: n,
      unit_price: need(longPrice(m, p.long[m as LongLength]), `${m}-min long-form`),
    });
  if (actual.extra && actual.extra.amount > 0)
    out.push({
      key: "custom",
      description: actual.extra.description.trim() || "Custom",
      qty: 1,
      unit_price: Math.round(actual.extra.amount * 100) / 100,
    });
  return out;
}

const itemsTotal = (items: ConfirmItem[]) =>
  Math.round(items.reduce((t, i) => t + i.qty * i.unit_price, 0) * 100) / 100;

/**
 * Booked vs actual (owner, 28 Oct 2026): overtime per extra hour (a shorter shoot isn't
 * credited: the time was booked), short-form by count, each long-form by its final length,
 * long-forms added or dropped. Throws on a missing price.
 */
export function shotDiff(booked: ShotPlan, actual: ShotPlan, p: ContentPrices) {
  const bookedItems = shotItems(booked, booked, p);
  const items = shotItems(actual, booked, p);
  const lines: AdjustLine[] = [];
  const add = (description: string, amount: number) => {
    const a = Math.round(amount * 100) / 100;
    if (!a) return;
    lines.push(
      a > 0
        ? { description, qty: 1, unit_price: a }
        : { description, qty: 1, unit_price: a, kind: "credit" },
    );
  };
  const steps = overtimeSteps(booked.hours, actual.hours);
  if (steps) add(`+${steps} h overtime`, steps * Number(p.overtime));
  const ds = actual.short - booked.short;
  if (ds)
    add(
      `${ds > 0 ? "+" : "−"}${Math.abs(ds)} short edit${Math.abs(ds) === 1 ? "" : "s"}`,
      ds * Number(p.short),
    );
  const lp = (m: number) => Number(longPrice(m, p.long[m as LongLength]));
  for (let i = 0; i < Math.max(booked.longs.length, actual.longs.length); i++) {
    const b = booked.longs[i];
    const a = actual.longs[i];
    if (b != null && a != null && a !== b) add(`Long-form ${i + 1}: ${b}→${a} min`, lp(a) - lp(b));
    else if (b == null && a != null) add(`+1 long-form edit (${a} min)`, lp(a));
    else if (b != null && a == null) add(`−1 long-form edit (${b} min)`, -lp(b));
  }
  if (actual.extra && actual.extra.amount > 0)
    add(`+${actual.extra.description.trim() || "Custom"}`, actual.extra.amount);
  const bookedTotal = itemsTotal(bookedItems);
  const actualTotal = itemsTotal(items);
  return { lines, items, bookedTotal, actualTotal, diff: actualTotal - bookedTotal };
}

/** The client's note: "Updated after the shoot: 4h → 4.5h, +1 short edit". */
export function shotNote(booked: ShotPlan, actual: ShotPlan, lines: AdjustLine[]) {
  const parts = [
    actual.hours !== booked.hours ? `${hoursText(booked.hours)} → ${hoursText(actual.hours)}` : "",
    ...lines.filter((l) => !/overtime$/.test(l.description)).map((l) => l.description),
    actual.raw !== booked.raw ? (actual.raw ? "raw files added" : "no raw files") : "",
  ].filter(Boolean);
  return parts.length ? `Updated after the shoot: ${parts.join(", ")}` : "";
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
      out.push(rate(KEY.short, "Short-form video (30–90 sec)", Math.max(1, v.short ?? 1)));
      if (v.long) out.push(rate(KEY.long, "Walkthrough (up to 5 min)", v.long));
      out.push(rate(KEY.min[day], `Minimum · ${DAY_LABEL[day].toLowerCase()}, edited`, 1, true));
      continue;
    }
    if (v.short) out.push(rate(KEY.short, "Short-form video (30–90 sec)", v.short));
    if (v.long) out.push(rate(KEY.long, "Walkthrough (up to 5 min)", v.long));
    if (v.long && v.extra_min) out.push(rate(KEY.extra, "Walkthrough, extra minutes", v.extra_min));
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
