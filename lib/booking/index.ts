/**
 * Property booking builder logic (guide §8). Pure functions over a typed state object, so the
 * rules can be unit-tested and the same state can later be POSTed to the real booking API.
 * All prices come from `PropertyPricing` (content/pricing.ts now, the admin later).
 */
import type {
  Lighting,
  PropertyPricing,
  PropertyType,
  ResidentialSize,
  TwilightQty,
} from "@/content/types";

export const EVENING = "Evening";
export const TWILIGHT_QTYS: TwilightQty[] = [5, 10, 20];

export interface BookingProperty {
  id: number;
  type: PropertyType;
  /** Index into the size list (apartment / villa) or the commercial tier list. */
  size: number;
  photo: boolean;
  twilight: boolean;
  twilightQty: TwilightQty;
  video: boolean;
  short: boolean;
  long: boolean;
  lighting: Lighting;
  tour: boolean;
  area: string;
  building: string;
  unit: string;
  /** ISO date, yyyy-mm-dd. */
  date: string;
  slot: string;
}

export interface BookingState {
  properties: BookingProperty[];
  nextId: number;
}

export type Toggle = "photo" | "video" | "short" | "long" | "tour" | "twilight";

export interface PriceLine {
  label: string;
  amount: number;
}

/* ---------- lookups ---------- */

export function defaultSize(type: PropertyType, pricing: PropertyPricing) {
  if (type === "commercial") return pricing.commercial.defaultTier;
  return pricing[type].defaultSize;
}

function residentialSize(p: BookingProperty, pricing: PropertyPricing): ResidentialSize | null {
  if (p.type === "commercial") return null;
  return pricing[p.type].sizes[p.size] ?? null;
}

function commercialTier(p: BookingProperty, pricing: PropertyPricing) {
  return p.type === "commercial" ? (pricing.commercial.tiers[p.size] ?? null) : null;
}

/** Commercial tiers without a long-form or 360 price can't book that service (e.g. Basic). */
export function isLocked(p: BookingProperty, service: "long" | "tour", pricing: PropertyPricing) {
  const tier = commercialTier(p, pricing);
  return tier ? tier[service] === null : false;
}

/** Night or day + night long-form (apartments and villas) must be shot in the evening. */
export function needsEvening(p: BookingProperty) {
  return p.video && p.long && p.type !== "commercial" && p.lighting !== "day";
}

export function twilightTable(p: BookingProperty, pricing: PropertyPricing) {
  return p.type === "villa" ? pricing.twilight.villa : pricing.twilight.standard;
}

/** Service unit prices for the open card (null = not available). */
export function servicePrices(p: BookingProperty, pricing: PropertyPricing) {
  const res = residentialSize(p, pricing);
  if (res) {
    return { photo: res.photo, short: res.short, long: res.long[p.lighting], tour: res.tour };
  }
  const tier = commercialTier(p, pricing);
  return {
    photo: tier?.photo ?? 0,
    short: tier?.short ?? 0,
    long: tier?.long ?? null,
    tour: tier?.tour ?? null,
  };
}

/* ---------- rules ---------- */

/**
 * Apply every rule after a change, so the state can never hold an invalid combination:
 * locked commercial services are off; video with no format is off; night long-form forces the
 * evening slot; the size index stays in range.
 */
export function normalize(p: BookingProperty, pricing: PropertyPricing): BookingProperty {
  const q = { ...p };
  const count =
    q.type === "commercial" ? pricing.commercial.tiers.length : pricing[q.type].sizes.length;
  if (q.size < 0 || q.size >= count) q.size = defaultSize(q.type, pricing);
  if (isLocked(q, "long", pricing)) q.long = false;
  if (isLocked(q, "tour", pricing)) q.tour = false;
  if (q.video && !q.short && !q.long) q.video = false;
  if (!q.video) {
    q.short = false;
    q.long = false;
  }
  if (!q.photo) q.twilight = false;
  if (needsEvening(q)) q.slot = EVENING;
  return q;
}

/** Toggle a service card or checkbox, with the builder's side effects. */
export function toggle(p: BookingProperty, key: Toggle, pricing: PropertyPricing) {
  if ((key === "long" || key === "tour") && isLocked(p, key, pricing)) return p;
  const q = { ...p, [key]: !p[key] };
  // Turning Videography on selects Short-form by default (guide §8.2).
  if (key === "video" && q.video) {
    q.short = true;
    q.long = false;
  }
  return normalize(q, pricing);
}

export function setType(p: BookingProperty, type: PropertyType, pricing: PropertyPricing) {
  if (p.type === type) return p;
  return normalize({ ...p, type, size: defaultSize(type, pricing) }, pricing);
}

/* ---------- prices ---------- */

export function priceLines(p: BookingProperty, pricing: PropertyPricing): PriceLine[] {
  const prices = servicePrices(p, pricing);
  const lines: PriceLine[] = [];
  if (p.photo) {
    lines.push({ label: "Photography", amount: prices.photo });
    if (p.twilight) {
      lines.push({
        label: `Twilight × ${p.twilightQty}`,
        amount: twilightTable(p, pricing)[p.twilightQty],
      });
    }
  }
  if (p.video && p.short) lines.push({ label: "Short-form video", amount: prices.short });
  if (p.video && p.long && prices.long !== null) {
    lines.push({ label: `Long-form video (${lightingLabel(p)})`, amount: prices.long });
  }
  if (p.tour && prices.tour !== null) lines.push({ label: "360° tour", amount: prices.tour });
  return lines;
}

export const subtotal = (p: BookingProperty, pricing: PropertyPricing) =>
  priceLines(p, pricing).reduce((n, l) => n + l.amount, 0);

export const total = (s: BookingState, pricing: PropertyPricing) =>
  s.properties.reduce((n, p) => n + subtotal(p, pricing), 0);

/** Twilight note: per-image price and the saving against the 5-image rate. */
export function twilightNote(p: BookingProperty, pricing: PropertyPricing) {
  const t = twilightTable(p, pricing);
  const perImage = t[p.twilightQty] / p.twilightQty;
  const per = Number.isInteger(perImage) ? String(perImage) : perImage.toFixed(1);
  if (p.twilightQty === 5) return `AED ${per} per image.`;
  const saving = Math.round((t[5] / 5) * p.twilightQty - t[p.twilightQty]);
  return `AED ${per} per image. You save AED ${saving.toLocaleString("en-US")}.`;
}

/* ---------- text ---------- */

const LIGHTING: Record<Lighting, string> = { day: "day", night: "night", dayNight: "day + night" };

function lightingLabel(p: BookingProperty) {
  return p.type === "commercial" ? "daylight" : LIGHTING[p.lighting];
}

/** "1 Bed apartment", "Studio apartment", "3 Bed villa / townhouse", "Premium commercial". */
export function title(p: BookingProperty, pricing: PropertyPricing) {
  if (p.type === "commercial") {
    return `${pricing.commercial.tiers[p.size]?.label ?? ""} commercial`;
  }
  const group = pricing[p.type];
  return `${group.sizes[p.size]?.label ?? ""} ${group.label.toLowerCase()}`;
}

/** Service names for summaries and the WhatsApp message (no prices). */
export function servicesText(p: BookingProperty) {
  const out: string[] = [];
  if (p.photo) out.push(p.twilight ? `Photography + ${p.twilightQty} twilight` : "Photography");
  if (p.video && p.short) out.push("Short-form video");
  if (p.video && p.long) {
    out.push(
      p.type === "commercial" ? "Long-form video" : `Long-form video (${LIGHTING[p.lighting]})`,
    );
  }
  if (p.tour) out.push("360° tour");
  return out;
}

/** "Thu 2 Oct" from an ISO date (date-only, so formatted in UTC to avoid day shifts). */
export function dateLabel(iso: string) {
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  const wd = d.toLocaleDateString("en-GB", { weekday: "short", timeZone: "UTC" });
  const md = d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
  return `${wd} ${md}`;
}

export function locationText(p: BookingProperty, withUnitWord = false) {
  const unit = p.unit.trim();
  return [unit ? (withUnitWord ? `Unit ${unit}` : unit) : "", p.building.trim(), p.area.trim()]
    .filter(Boolean)
    .join(", ");
}

const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * WhatsApp message (guide §8.4). No prices. Numbered only when there is more than one property.
 * `ref` is the lead reference; pass null to render the preview before a reference exists.
 */
export function buildMessage(s: BookingState, pricing: PropertyPricing, ref: string | null) {
  const many = s.properties.length > 1;
  const lines = [ref ? `Ref #${ref}` : "Ref #MW-···· (added when you send)", "Hi Milkywayy,"];
  lines.push(many ? `I'd like to book ${s.properties.length} properties:` : "I'd like to book:");
  s.properties.forEach((p, i) => {
    const services = servicesText(p).join(" + ") || "services to confirm";
    lines.push(`${many ? `${i + 1}. ` : ""}${capitalise(title(p, pricing))} — ${services}.`);
    const where = locationText(p, true);
    const when = `${dateLabel(p.date)}, ${p.slot.toLowerCase()}`;
    lines.push(where ? `${where} · ${when}` : when);
  });
  return lines.join("\n");
}

/* ---------- validation ---------- */

export type FieldError = "services" | "area" | "building";

export interface BookingErrors {
  /** property id → field → message */
  [id: number]: Partial<Record<FieldError, string>>;
}

export function validate(s: BookingState): BookingErrors {
  const errors: BookingErrors = {};
  for (const p of s.properties) {
    const e: Partial<Record<FieldError, string>> = {};
    if (!p.photo && !p.video && !p.tour)
      e.services = "Pick at least one service for this property.";
    if (!p.area.trim()) e.area = "Add the community or area, e.g. Dubai Marina.";
    if (!p.building.trim()) e.building = "Add the building or tower name.";
    if (Object.keys(e).length) errors[p.id] = e;
  }
  return errors;
}

/* ---------- state ---------- */

export function blankProperty(
  id: number,
  pricing: PropertyPricing,
  date: string,
  slot: string,
  from?: BookingProperty,
): BookingProperty {
  return {
    id,
    type: "apartment",
    size: defaultSize("apartment", pricing),
    photo: true,
    twilight: false,
    twilightQty: 5,
    video: false,
    short: false,
    long: false,
    lighting: "day",
    tour: false,
    area: from?.area ?? "",
    building: "",
    unit: "",
    date: from?.date ?? date,
    slot: from?.slot ?? slot,
  };
}

export type Action =
  | { type: "add"; date: string; slot: string }
  | { type: "duplicate"; id: number }
  | { type: "remove"; id: number }
  | { type: "toggle"; id: number; key: Toggle }
  | { type: "setType"; id: number; value: PropertyType }
  | { type: "update"; id: number; patch: Partial<BookingProperty> };

export function reducer(pricing: PropertyPricing) {
  return (s: BookingState, a: Action): BookingState => {
    const map = (id: number, fn: (p: BookingProperty) => BookingProperty) => ({
      ...s,
      properties: s.properties.map((p) => (p.id === id ? fn(p) : p)),
    });
    switch (a.type) {
      case "add": {
        const last = s.properties[s.properties.length - 1];
        const p = blankProperty(s.nextId, pricing, a.date, a.slot, last);
        return { properties: [...s.properties, p], nextId: s.nextId + 1 };
      }
      case "duplicate": {
        const i = s.properties.findIndex((p) => p.id === a.id);
        if (i < 0) return s;
        const copy = { ...s.properties[i], id: s.nextId, unit: "" };
        const properties = [...s.properties];
        properties.splice(i + 1, 0, copy);
        return { properties, nextId: s.nextId + 1 };
      }
      case "remove":
        if (s.properties.length <= 1) return s;
        return { ...s, properties: s.properties.filter((p) => p.id !== a.id) };
      case "toggle":
        return map(a.id, (p) => toggle(p, a.key, pricing));
      case "setType":
        return map(a.id, (p) => setType(p, a.value, pricing));
      case "update":
        return map(a.id, (p) => normalize({ ...p, ...a.patch }, pricing));
    }
  };
}
