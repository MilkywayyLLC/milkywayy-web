import type { Media, PortfolioCategory, PortfolioFormat } from "@/content/types";
import { realFirst } from "./data/sample.ts";

/**
 * Where library items show on the site (media library rework, 24 Oct 2026). Every section the
 * live pages render from the portfolio is defined here once: a rule (type + orientation +
 * categories), how many it shows and its card ratio. A section shows its pinned items in their
 * slots and fills the rest with the newest items matching its rule. "manual" sections (every
 * placement that existed before this rework, until "Reset to automatic") show only their pins.
 * Hero slots are always manual. The public pages, the admin's Placements screen and each item's
 * "Where it shows" tags all use `resolve` below, so they always agree.
 */

export type MediaType = "photo" | "video" | "avatar" | "tour";
export type Orientation = "9:16" | "16:9";
export type Mode = "auto" | "manual";

export const MEDIA_TYPES: { value: MediaType; label: string }[] = [
  { value: "photo", label: "Photo" },
  { value: "video", label: "Video edit" },
  { value: "avatar", label: "AI avatar video" },
  { value: "tour", label: "360 tour" },
];
export const ORIENTATIONS: { value: Orientation; label: string }[] = [
  { value: "9:16", label: "9:16 · short form" },
  { value: "16:9", label: "16:9 · long form" },
];
export const typeLabel = (t?: string) => MEDIA_TYPES.find((m) => m.value === t)?.label ?? "";

export interface Rule {
  types: MediaType[];
  orientation?: Orientation;
  /** Category ids; omitted = any category. */
  categories?: string[];
  /** Only items with "Show on Work page" on (pins included). */
  work?: boolean;
}

export interface PlacementDef {
  key: string;
  page: string;
  /** Path for Preview. */
  path: string;
  title: string;
  rule: Rule;
  /** How many it shows (Infinity = all). */
  count: number;
  /** Card ratio on the page. */
  ratio: string;
  /** Hero slots are filled by hand only. */
  hero?: boolean;
  /** Where the hero item comes from (default the media library). */
  source?: "library" | "before-after";
  /** While manual with no pins, the page keeps its previous source (described here). */
  legacy?: string;
}

const ALL: MediaType[] = ["photo", "video", "avatar", "tour"];

/** Hero slots, manual only (Placements → Hero slots). */
export const HEROES: PlacementDef[] = [
  {
    key: "home-showreel",
    page: "Home",
    path: "/",
    title: "Showreel",
    rule: { types: ["video"], orientation: "16:9" },
    count: 1,
    ratio: "16:9",
    hero: true,
    legacy: "Site settings → Showreel",
  },
  {
    key: "production-hero",
    page: "Production",
    path: "/production",
    title: "Hero",
    rule: { types: ["video"], orientation: "9:16" },
    count: 3,
    ratio: "9:16",
    hero: true,
  },
  {
    key: "property-hero-pair",
    page: "Property shoots",
    path: "/property-shoots",
    title: "Hero (before / after)",
    rule: { types: ["photo"] },
    count: 1,
    ratio: "3:2",
    hero: true,
    source: "before-after",
    legacy: "the first published Before / after pair",
  },
  {
    key: "post-hero-reels",
    page: "Post-production",
    path: "/post-production",
    title: "Hero",
    rule: { types: ["video"], orientation: "9:16" },
    count: 3,
    ratio: "9:16",
    hero: true,
  },
  {
    key: "avatars-hero",
    page: "AI avatars",
    path: "/ai-avatars",
    title: "Hero",
    rule: { types: ["avatar"], orientation: "9:16" },
    count: 1,
    ratio: "9:16",
    hero: true,
    legacy: "AI avatars → Hero (Adam)",
  },
  {
    key: "avatars-multilingual",
    page: "AI avatars",
    path: "/ai-avatars",
    title: "Multilingual demo",
    rule: { types: ["avatar"], orientation: "16:9" },
    count: 1,
    ratio: "16:9",
    hero: true,
  },
];

/** Automatic sections, in page order. */
export const SECTIONS: PlacementDef[] = [
  {
    key: "home-row-production",
    page: "Home",
    path: "/",
    title: "Services row · Production",
    rule: { types: ["video"] },
    count: 1,
    ratio: "frame",
  },
  {
    key: "home-row-post",
    page: "Home",
    path: "/",
    title: "Services row · Post-production",
    rule: { types: ["photo", "video"], categories: ["editing"] },
    count: 1,
    ratio: "frame",
  },
  {
    key: "home-row-avatars",
    page: "Home",
    path: "/",
    title: "Services row · AI avatars",
    rule: { types: ["avatar"] },
    count: 1,
    ratio: "frame",
  },
  {
    key: "production-recent",
    page: "Production",
    path: "/production",
    title: "Recent work",
    rule: {
      types: ["video"],
      orientation: "9:16",
      categories: ["property", "brand", "holiday-home"],
    },
    count: 5,
    ratio: "9:16",
  },
  {
    key: "showcase-photos",
    page: "Home, Property shoots, Post-production",
    path: "/",
    title: "Dashboard preview frames",
    rule: { types: ["photo"], categories: ["property"] },
    count: 9,
    ratio: "3:2",
    legacy: "the newest real photos",
  },
  {
    key: "property-gallery-photo",
    page: "Property shoots",
    path: "/property-shoots",
    title: "Samples · Photos",
    rule: { types: ["photo"], categories: ["property"] },
    count: 8,
    ratio: "3:2",
  },
  {
    key: "property-gallery-video",
    page: "Property shoots",
    path: "/property-shoots",
    title: "Samples · Videos",
    rule: { types: ["video"], categories: ["property"] },
    count: 6,
    ratio: "9:16 / 16:9",
  },
  {
    key: "property-gallery-360",
    page: "Property shoots",
    path: "/property-shoots",
    title: "Samples · 360 tours",
    rule: { types: ["tour"] },
    count: 6,
    ratio: "16:9",
  },
  {
    key: "post-service-cards",
    page: "Post-production",
    path: "/post-production",
    title: "Service cards",
    rule: { types: ["photo", "video"], categories: ["editing"] },
    count: 6,
    ratio: "frame",
  },
  {
    key: "post-hero",
    page: "Post-production",
    path: "/post-production",
    title: "Work we've delivered",
    rule: { types: ["photo", "video", "avatar"], categories: ["editing"] },
    count: 9,
    ratio: "3:2 / 9:16 / 16:9",
  },
  {
    key: "avatars-carousel",
    page: "AI avatars",
    path: "/ai-avatars",
    title: "Avatar carousel",
    rule: { types: ["avatar"], orientation: "9:16" },
    count: 5,
    ratio: "9:16",
    legacy: "the AI avatars list",
  },
  {
    key: "work",
    page: "Work",
    path: "/work",
    title: "Portfolio grid (by tab)",
    rule: { types: ALL, work: true },
    count: Infinity,
    ratio: "3:2 / 9:16 / 16:9",
  },
];

export const ALL_PLACEMENTS = [...HEROES, ...SECTIONS];
export const placementByKey = (key: string) => ALL_PLACEMENTS.find((p) => p.key === key);

/** The small rule line: "Photo · Property · 3:2 · shows 8". */
export function ruleText(d: PlacementDef, catLabel: (id: string) => string = (id) => id) {
  const parts = [
    d.rule.types.length === ALL.length
      ? "Any type"
      : d.rule.types.map((t) => typeLabel(t)).join(" / "),
    d.rule.orientation ?? "",
    d.rule.work ? "Show on Work page" : "",
    d.rule.categories ? d.rule.categories.map(catLabel).join(" + ") : "Any category",
    d.ratio === "frame" ? "" : d.ratio,
    d.count === Infinity ? "shows all" : `shows ${d.count}`,
  ];
  if (d.source === "before-after") return "Before / after pair · 3:2 · shows 1";
  return parts.filter(Boolean).join(" · ");
}

/* ---------- library fields (with the pre-migration fallback) ---------- */

export interface LibItem {
  id: string;
  published: boolean;
  sample?: boolean;
  sortOrder: number;
  mediaType: MediaType;
  orientation?: Orientation;
  categoryId?: string;
  showOnWork: boolean;
  createdAt?: string;
}

/** The new columns, or (before the migration runs) the same values worked out from the old ones. */
export function libFields(
  r: Record<string, unknown>,
): Omit<LibItem, "id" | "published" | "sortOrder"> {
  const category = r.category as PortfolioCategory | undefined;
  const format = r.format as PortfolioFormat | undefined;
  const placements = (r.portfolio_placements as { placement: string }[] | undefined) ?? [];
  const mediaType =
    (r.media_type as MediaType | null) ??
    (category === "ai-avatar"
      ? "avatar"
      : format === "photo"
        ? "photo"
        : format === "360"
          ? "tour"
          : "video");
  const orientation =
    (r.orientation as Orientation | null) ??
    (format === "long-form"
      ? "16:9"
      : format === "reel" || category === "ai-avatar"
        ? "9:16"
        : undefined);
  const categoryId =
    r.media_type != null
      ? ((r.category_id as string | null) ?? undefined)
      : category && category !== "ai-avatar"
        ? category
        : undefined;
  const showOnWork =
    typeof r.show_on_work === "boolean" && r.media_type != null
      ? r.show_on_work
      : placements.some((p) => p.placement === "work");
  return {
    sample: r.sample ? true : undefined,
    mediaType,
    orientation,
    categoryId,
    showOnWork,
    createdAt: (r.created_at as string | undefined) ?? undefined,
  };
}

/** The old category / format columns, kept in step with the new fields (rollback safety). */
export function legacyFields(
  mediaType: MediaType,
  orientation: Orientation | undefined,
  categoryId: string | undefined,
): { category: PortfolioCategory; format: PortfolioFormat } {
  const format: PortfolioFormat =
    mediaType === "photo"
      ? "photo"
      : mediaType === "tour"
        ? "360"
        : orientation === "16:9"
          ? "long-form"
          : "reel";
  const category: PortfolioCategory =
    mediaType === "avatar"
      ? "ai-avatar"
      : categoryId === "brand" || categoryId === "editing"
        ? categoryId
        : "property";
  return { category, format };
}

/**
 * Orientation from what was added: the uploaded file's size, an Instagram reel (always 9:16), a
 * YouTube Shorts link (9:16) or another YouTube/Vimeo link (16:9), else the cover's shape.
 */
export function detectOrientation(m: Media | undefined): Orientation | undefined {
  if (!m) return undefined;
  const shape = (w?: number, h?: number) => (w && h ? (w < h ? "9:16" : "16:9") : undefined);
  const file = shape(m.file?.width, m.file?.height);
  if (file) return file;
  if (m.source === "instagram" && m.instagram?.url) return "9:16";
  // A reel's YouTube link is only offered for 9:16 (youtu.be links don't say which).
  if (m.source === "youtube" && m.video) return "9:16";
  const v = m.video ?? "";
  if (/youtube\.com\/shorts\//i.test(v)) return "9:16";
  if (/youtube\.com|youtu\.be|vimeo\.com/i.test(v)) return "16:9";
  return shape(m.width, m.height);
}

/** Required cover/crop ratio for an item: photo 3:2, short 9:16, long 16:9, 360 cover 16:9. */
export function ratioFor(mediaType: MediaType, orientation?: Orientation) {
  if (mediaType === "photo") return "3:2";
  if (mediaType === "tour") return "16:9";
  return orientation ?? "9:16";
}

export function matches(rule: Rule, x: LibItem) {
  if (!rule.types.includes(x.mediaType)) return false;
  if (rule.orientation && x.orientation !== rule.orientation) return false;
  if (rule.categories && !(x.categoryId && rule.categories.includes(x.categoryId))) return false;
  if (rule.work && !x.showOnWork) return false;
  return true;
}

/* ---------- resolving a section ---------- */

export type Pin = { section: string; slot: number; item_id: string };
export interface PlacementState {
  pins: Pin[];
  modes: Record<string, Mode>;
}

/** Sections the migration sets to manual (supabase/migrations/20261024090000_…). */
export const MIGRATED_MANUAL = [
  "home-row-production",
  "home-row-post",
  "home-row-avatars",
  "property-gallery-photo",
  "property-gallery-video",
  "property-gallery-360",
  "post-service-cards",
  "post-hero",
  "avatars-carousel",
  "showcase-photos",
];

/**
 * Before the migration runs (or after a code rollback of the tables): the old placements read as
 * the pins the migration would create, so the site renders exactly as before.
 */
export function legacyState(
  items: {
    id: string;
    sortOrder: number;
    placements: string[];
    placementOrder?: Partial<Record<string, number>>;
  }[],
): PlacementState {
  const by = new Map<string, { id: string; at: number }[]>();
  for (const i of items)
    for (const p of i.placements) {
      if (p === "home-reels" || p === "property-hero") continue;
      by.set(p, [...(by.get(p) ?? []), { id: i.id, at: i.placementOrder?.[p] ?? i.sortOrder }]);
    }
  const pins: Pin[] = [];
  for (const [section, list] of by)
    list
      .sort((a, b) => a.at - b.at || a.id.localeCompare(b.id))
      .forEach((x, slot) => pins.push({ section, slot, item_id: x.id }));
  return { pins, modes: Object.fromEntries(MIGRATED_MANUAL.map((k) => [k, "manual" as Mode])) };
}
export type Slot<T> = { slot: number; item: T; pinned: boolean };
export interface Resolved<T> {
  mode: Mode;
  /** Manual with no pins and a previous source: the page keeps using that source. */
  legacy: boolean;
  slots: Slot<T>[];
  items: T[];
}

const newest = <T extends LibItem>(a: T, b: T) =>
  (b.createdAt ?? "").localeCompare(a.createdAt ?? "") || b.sortOrder - a.sortOrder;

export function modeOf(def: PlacementDef, st: PlacementState): Mode {
  return def.hero ? "manual" : (st.modes[def.key] ?? "auto");
}

export function resolve<T extends LibItem>(
  def: PlacementDef,
  all: T[],
  st: PlacementState,
): Resolved<T> {
  const live = all.filter((x) => x.published);
  const byId = new Map(live.map((x) => [x.id, x]));
  const mode = modeOf(def, st);
  const pins = st.pins
    .filter((p) => p.section === def.key)
    .sort((a, b) => a.slot - b.slot)
    .map((p) => ({ slot: p.slot, item: byId.get(p.item_id) }))
    .filter(
      (p): p is { slot: number; item: T } => !!p.item && (!def.rule.work || p.item.showOnWork),
    );

  let slots: Slot<T>[];
  if (mode === "manual") {
    if (!pins.length && def.legacy) return { mode, legacy: true, slots: [], items: [] };
    slots = pins.map((p) => ({ ...p, pinned: true }));
  } else {
    const taken = new Set(pins.map((p) => p.item.id));
    const pool = realFirst(live.filter((x) => matches(def.rule, x) && !taken.has(x.id))).sort(
      newest,
    );
    const at = new Map(pins.map((p) => [p.slot, p.item]));
    const lastPin = pins.length ? pins[pins.length - 1].slot : -1;
    slots = [];
    for (let i = 0; slots.length < def.count && (i <= lastPin || pool.length); i++) {
      const pinned = at.get(i);
      if (pinned) slots.push({ slot: i, item: pinned, pinned: true });
      else if (pool.length) slots.push({ slot: i, item: pool.shift()!, pinned: false });
    }
  }
  // Samples step aside once real work is there (lib/data/sample).
  const keep = new Set(realFirst(slots.map((s) => s.item)).map((x) => x.id));
  slots = slots.filter((s) => keep.has(s.item.id));
  return { mode, legacy: false, slots, items: slots.map((s) => s.item) };
}

/** Every place an item shows: "Home · Showreel", "Work · Portfolio grid (by tab)", … */
export function whereItShows<T extends LibItem>(
  id: string,
  all: T[],
  st: PlacementState,
): { key: string; label: string }[] {
  return ALL_PLACEMENTS.filter(
    (d) => d.source !== "before-after" && resolve(d, all, st).items.some((x) => x.id === id),
  ).map((d) => ({ key: d.key, label: `${d.page.split(",")[0]} · ${d.title}` }));
}
