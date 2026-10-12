import type { SupabaseClient } from "@supabase/supabase-js";
import type { OtherPricing, PropertyPricing } from "@/content/types";
import * as map from "@/lib/data/rows";
import type { Media } from "@/content/types";
import {
  legacyState,
  libFields,
  type LibItem,
  type Mode,
  type Pin,
  type PlacementState,
} from "@/lib/placements";
import type { UsageItem } from "@/lib/used-on";
import { PRICING_OTHER_KEYS, type Doc } from "./docs";
import type { Option } from "./fields";
import type { Row, Section } from "./sections";

/** Admin reads: always fresh, as the signed-in admin (so drafts and unpublished rows show). */

const PORTFOLIO_SELECT = "*, portfolio_placements(placement, sort_order)";

/** Portfolio placements live in their own table; the editor treats them as a list on the item. */
function flatten(section: Section, r: Record<string, unknown>): Row {
  if (section.key !== "portfolio") return r as Row;
  const pl = (r.portfolio_placements ?? []) as { placement: string; sort_order: number }[];
  const rest = { ...r };
  delete rest.portfolio_placements;
  // Library fields, worked out from the old ones on rows saved before the migration.
  const lib = libFields(r);
  return {
    ...(rest as Row),
    media_type: lib.mediaType,
    orientation: lib.orientation ?? null,
    category_id: lib.categoryId ?? null,
    show_on_work: lib.showOnWork,
    placements: pl.map((p) => p.placement),
    placement_order: Object.fromEntries(pl.map((p) => [p.placement, p.sort_order])),
  };
}

export async function listRows(db: SupabaseClient, section: Section): Promise<Row[]> {
  const select = section.key === "portfolio" ? PORTFOLIO_SELECT : "*";
  const { data, error } = await db.from(section.table).select(select).order("sort_order");
  if (error) throw new Error(`${section.table}: ${error.message}`);
  return ((data ?? []) as unknown as Record<string, unknown>[]).map((r) => flatten(section, r));
}

export async function getRow(db: SupabaseClient, section: Section, id: string) {
  const select = section.key === "portfolio" ? PORTFOLIO_SELECT : "*";
  const { data } = await db.from(section.table).select(select).eq("id", id).maybeSingle();
  return data ? flatten(section, data as unknown as Record<string, unknown>) : null;
}

/** The live value of a document. */
export async function liveDoc(db: SupabaseClient, doc: Doc): Promise<Record<string, unknown>> {
  if (doc.key === "pricing_other") {
    const { data } = await db.from("pricing_other").select("key, value");
    const get = (k: string) => data?.find((r) => r.key === k)?.value;
    return {
      production: get(PRICING_OTHER_KEYS.production),
      postProduction: get(PRICING_OTHER_KEYS.postProduction),
      aiAvatars: get(PRICING_OTHER_KEYS.aiAvatars),
    } satisfies Partial<Record<keyof OtherPricing, unknown>>;
  }
  const { data } = await db.from("site_settings").select("value").eq("key", doc.key).maybeSingle();
  if (!data) throw new Error(`site_settings: missing "${doc.key}"`);
  return data.value as Record<string, unknown>;
}

export async function getDraft(db: SupabaseClient, key: string) {
  const { data } = await db
    .from("drafts")
    .select("value, updated_by, updated_at")
    .eq("key", key)
    .maybeSingle();
  return data as { value: unknown; updated_by: string; updated_at: string } | null;
}

export async function livePricing(db: SupabaseClient): Promise<PropertyPricing> {
  const q = (t: string, o: string) => db.from(t).select("*").order(o);
  const [sizes, tiers, twilight, meta] = await Promise.all([
    q("pricing_property", "size_index"),
    q("pricing_commercial_tiers", "tier_index"),
    q("pricing_twilight", "qty"),
    db.from("pricing_other").select("value").eq("key", "property_meta").maybeSingle(),
  ]);
  if (sizes.error || tiers.error || twilight.error || !meta.data)
    throw new Error("Couldn't read the price tables.");
  return map.propertyPricing(sizes.data, tiers.data, twilight.data, meta.data.value);
}

/** A table the media library migration adds isn't there yet. */
const notMigrated = (e: { code?: string; message?: string }) =>
  e.code === "PGRST205" || e.code === "42P01" || /could not find the table/i.test(e.message ?? "");

/** Media library categories, in order. Before the migration: the four old ones. */
export async function listCategories(db: SupabaseClient): Promise<Option[]> {
  const { data, error } = await db
    .from("media_categories")
    .select("id, label")
    .order("sort_order")
    .order("label");
  if (error) {
    if (notMigrated(error))
      return [
        { value: "property", label: "Property" },
        { value: "brand", label: "Brand" },
        { value: "editing", label: "Editing" },
      ];
    throw new Error(`media_categories: ${error.message}`);
  }
  return (data ?? []).map((c) => ({ value: c.id, label: c.label }));
}

/** Pins and modes (lib/placements); the old placements stand in before the migration. */
export async function placementState(
  db: SupabaseClient,
  items: LibRow[],
): Promise<PlacementState & { migrated: boolean }> {
  const [pins, modes] = await Promise.all([
    db.from("placement_pins").select("section, slot, item_id"),
    db.from("placement_modes").select("section, mode"),
  ]);
  const error = pins.error ?? modes.error;
  if (error) {
    if (!notMigrated(error)) throw new Error(`placements: ${error.message}`);
    return { ...legacyState(items), migrated: false };
  }
  return {
    pins: (pins.data ?? []) as Pin[],
    modes: Object.fromEntries((modes.data ?? []).map((m) => [m.section, m.mode as Mode])),
    migrated: true,
  };
}

/** A portfolio row as the library sees it (lib/placements LibItem plus the old fields). */
export type LibRow = LibItem &
  UsageItem & { placements: string[]; title: string; thumb?: string; media: Media };

export function libRow(r: Row): LibRow {
  return {
    id: r.id,
    published: !!r.published,
    sortOrder: r.sort_order,
    title: String(r.title ?? ""),
    media: (r.media ?? { alt: "" }) as Media,
    thumb: (r.media as Media | undefined)?.src,
    format: r.format as never,
    category: r.category as never,
    placements: (r.placements ?? []) as never,
    placementOrder: (r.placement_order ?? {}) as never,
    ...libFields(r),
    sample: !!r.sample,
  };
}

/**
 * What the editors need to say where an item shows: every portfolio item (light), the published
 * AI avatar examples in site order, the categories and the pins.
 */
export async function adminCtx(db: SupabaseClient): Promise<import("./fields").AdminCtx> {
  const { sectionByKey } = await import("./sections");
  const [rows, avatars, categories] = await Promise.all([
    listRows(db, sectionByKey("portfolio")!),
    db.from("avatars").select("id, published, sample, sort_order").order("sort_order"),
    listCategories(db),
  ]);
  const live = (avatars.data ?? []).filter((a) => a.published);
  const real = live.filter((a) => !a.sample);
  const portfolio = rows.map(libRow);
  return {
    portfolio,
    avatarOrder: (real.length ? real : live).map((a) => a.id),
    categories,
    placements: await placementState(db, portfolio),
  };
}
