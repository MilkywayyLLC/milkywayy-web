import type { SupabaseClient } from "@supabase/supabase-js";
import type { OtherPricing, PropertyPricing } from "@/content/types";
import * as map from "@/lib/data/rows";
import { PRICING_OTHER_KEYS, type Doc } from "./docs";
import type { Row, Section } from "./sections";

/** Admin reads: always fresh, as the signed-in admin (so drafts and unpublished rows show). */

const PORTFOLIO_SELECT = "*, portfolio_placements(placement, sort_order)";

/** Portfolio placements live in their own table; the editor treats them as a list on the item. */
function flatten(section: Section, r: Record<string, unknown>): Row {
  if (section.key !== "portfolio") return r as Row;
  const pl = (r.portfolio_placements ?? []) as { placement: string; sort_order: number }[];
  const rest = { ...r };
  delete rest.portfolio_placements;
  return {
    ...(rest as Row),
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
