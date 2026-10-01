import type {
  CommercialTier,
  PropertyPricing,
  ResidentialSize,
  TwilightQty,
} from "@/content/types";
import type { Change } from "./fields";

/** Columns of the property price tables, in the order the booking builder shows them. */
export const RES_COLUMNS = [
  { key: "photo", label: "Photography" },
  { key: "short", label: "Short-form" },
  { key: "long.day", label: "LF day" },
  { key: "long.night", label: "LF night" },
  { key: "long.dayNight", label: "LF day+night" },
  { key: "tour", label: "360 tour" },
] as const;
export const COM_COLUMNS = [
  { key: "photo", label: "Photography" },
  { key: "short", label: "Short-form" },
  { key: "long", label: "Long-form" },
  { key: "tour", label: "360 tour" },
] as const;
export const QTYS: TwilightQty[] = [5, 10, 20];

const resPrice = (s: ResidentialSize, key: string): number =>
  key.startsWith("long.")
    ? s.long[key.slice(5) as keyof ResidentialSize["long"]]
    : (s[key as "photo" | "short" | "tour"] as number);

const aed = (n: number | null | undefined) =>
  n === null || n === undefined ? "not offered" : `AED ${n.toLocaleString("en-US")}`;
const text = (v: string | null | undefined) => (v ? v : "not included");

const isPrice = (n: unknown) =>
  Number.isInteger(n) && (n as number) >= 0 && (n as number) <= 1_000_000;

/** Server-side check of a whole price table set. Returns a list of problems (empty = fine). */
export function checkPricing(p: PropertyPricing): string[] {
  const out: string[] = [];
  for (const type of ["apartment", "villa"] as const) {
    const sizes = p[type]?.sizes ?? [];
    if (!sizes.length) out.push(`${p[type]?.label ?? type}: add at least one size.`);
    if (sizes.length > 12) out.push(`${p[type].label}: up to 12 sizes.`);
    const labels = new Set<string>();
    sizes.forEach((s, i) => {
      const name = s.label?.trim();
      if (!name || name.length > 20)
        out.push(`${p[type].label} row ${i + 1}: size name (up to 20 characters).`);
      if (labels.has(name)) out.push(`${p[type].label}: “${name}” is listed twice.`);
      labels.add(name);
      for (const c of RES_COLUMNS)
        if (!isPrice(resPrice(s, c.key)))
          out.push(`${p[type].label} · ${name || `row ${i + 1}`} · ${c.label}: whole AED amount.`);
    });
    if (!(p[type].defaultSize >= 0 && p[type].defaultSize < sizes.length))
      out.push(`${p[type].label}: choose which size is selected first.`);
  }
  const tiers = p.commercial?.tiers ?? [];
  if (!tiers.length || tiers.length > 8) out.push("Commercial: 1 to 8 tiers.");
  tiers.forEach((t, i) => {
    const name = t.label?.trim() || `tier ${i + 1}`;
    if (!t.label?.trim() || t.label.length > 20)
      out.push(`Commercial ${name}: tier name (up to 20 characters).`);
    if (!t.description?.trim() || t.description.length > 40)
      out.push(`Commercial ${name}: short description (up to 40 characters).`);
    if (!isPrice(t.photo) || !isPrice(t.short))
      out.push(`Commercial ${name}: photography and short-form prices are required.`);
    if (t.long !== null && !isPrice(t.long))
      out.push(`Commercial ${name}: long-form price or “not offered”.`);
    if (t.tour !== null && !isPrice(t.tour))
      out.push(`Commercial ${name}: 360 tour price or “not offered”.`);
    if (!t.includes?.photos?.trim() || !t.includes?.reel?.trim())
      out.push(`Commercial ${name}: photos and reel length are required.`);
  });
  if (!(p.commercial.defaultTier >= 0 && p.commercial.defaultTier < tiers.length))
    out.push("Commercial: choose which tier is selected first.");
  for (const grp of ["standard", "villa"] as const)
    for (const q of QTYS)
      if (!isPrice(p.twilight?.[grp]?.[q])) out.push(`Twilight ${grp} × ${q}: whole AED amount.`);
  return out;
}

/** Every difference, worded for the confirmation dialog and the change log. */
export function pricingChanges(a: PropertyPricing, b: PropertyPricing): Change[] {
  const out: Change[] = [];
  const push = (label: string, o: string, n: string) =>
    o !== n && out.push({ label, old: o, new: n });
  for (const type of ["apartment", "villa"] as const) {
    const L = b[type].label;
    const max = Math.max(a[type].sizes.length, b[type].sizes.length);
    for (let i = 0; i < max; i++) {
      const s0 = a[type].sizes[i];
      const s1 = b[type].sizes[i];
      if (!s1) {
        push(`${L} · ${s0.label}`, "listed", "removed");
        continue;
      }
      if (!s0) {
        push(
          `${L} · ${s1.label}`,
          "not listed",
          `added (${RES_COLUMNS.map((c) => aed(resPrice(s1, c.key))).join(" / ")})`,
        );
        continue;
      }
      push(`${L} · size ${i + 1} name`, s0.label, s1.label);
      for (const c of RES_COLUMNS)
        push(`${L} · ${s1.label} · ${c.label}`, aed(resPrice(s0, c.key)), aed(resPrice(s1, c.key)));
    }
    push(
      `${L} · selected first`,
      a[type].sizes[a[type].defaultSize]?.label ?? "—",
      b[type].sizes[b[type].defaultSize]?.label ?? "—",
    );
  }
  const max = Math.max(a.commercial.tiers.length, b.commercial.tiers.length);
  for (let i = 0; i < max; i++) {
    const t0 = a.commercial.tiers[i];
    const t1 = b.commercial.tiers[i];
    if (!t1) {
      push(`Commercial · ${t0.label}`, "listed", "removed");
      continue;
    }
    if (!t0) {
      push(`Commercial · ${t1.label}`, "not listed", "added");
      continue;
    }
    const L = `Commercial · ${t1.label}`;
    push(`Commercial · tier ${i + 1} name`, t0.label, t1.label);
    for (const c of COM_COLUMNS) push(`${L} · ${c.label}`, aed(t0[c.key]), aed(t1[c.key]));
    push(`${L} · description`, t0.description, t1.description);
    push(`${L} · most popular`, t0.popular ? "yes" : "no", t1.popular ? "yes" : "no");
    push(`${L} · photos`, t0.includes.photos, t1.includes.photos);
    push(`${L} · reel`, t0.includes.reel, t1.includes.reel);
    push(`${L} · walkthrough`, text(t0.includes.walkthrough), text(t1.includes.walkthrough));
    push(`${L} · 360 hotspots`, text(t0.includes.tourHotspots), text(t1.includes.tourHotspots));
  }
  push(
    "Commercial · selected first",
    a.commercial.tiers[a.commercial.defaultTier]?.label ?? "—",
    b.commercial.tiers[b.commercial.defaultTier]?.label ?? "—",
  );
  for (const grp of ["standard", "villa"] as const)
    for (const q of QTYS)
      push(
        `Twilight · ${grp === "standard" ? "Apartment / commercial" : "Villa"} · ${q} photos`,
        aed(a.twilight[grp][q]),
        aed(b.twilight[grp][q]),
      );
  return out;
}

/** PropertyPricing → the rows publish_property_pricing() writes. */
export function pricingRows(p: PropertyPricing) {
  const service = {
    photo: "photo",
    short: "short",
    "long.day": "lf_day",
    "long.night": "lf_night",
    "long.dayNight": "lf_day_night",
    tour: "tour",
  } as const;
  const sizes = (["apartment", "villa"] as const).flatMap((type) =>
    p[type].sizes.flatMap((s, i) =>
      RES_COLUMNS.map((c) => ({
        type,
        size_index: i,
        size_label: s.label.trim(),
        service: service[c.key],
        price: resPrice(s, c.key),
      })),
    ),
  );
  const tiers = p.commercial.tiers.map((t: CommercialTier, i) => ({
    tier_index: i,
    label: t.label.trim(),
    description: t.description.trim(),
    popular: !!t.popular,
    photo: t.photo,
    short: t.short,
    long: t.long,
    tour: t.tour,
    photos: t.includes.photos.trim(),
    reel: t.includes.reel.trim(),
    walkthrough: t.includes.walkthrough?.trim() || null,
    tour_hotspots: t.includes.tourHotspots?.trim() || null,
  }));
  const twilight = (["standard", "villa"] as const).flatMap((grp) =>
    QTYS.map((qty) => ({ grp, qty, price: p.twilight[grp][qty] })),
  );
  const meta = {
    currency: "AED",
    apartment: { label: p.apartment.label, defaultSize: p.apartment.defaultSize },
    villa: { label: p.villa.label, defaultSize: p.villa.defaultSize },
    commercial: { label: p.commercial.label, defaultTier: p.commercial.defaultTier },
    delivery: p.delivery,
  };
  return { sizes, tiers, twilight, meta };
}
