"use server";

import { headers } from "next/headers";
import { refresh } from "@/lib/data/refresh";
import { placementByKey } from "@/lib/placements";
import { adminOrThrow } from "./auth";

/**
 * Admin → Placements writes (24 Oct 2026): pin an item into a section's slot, unpin it, or reset a
 * section to automatic. Runs as the signed-in admin, so row-level security decides; each change
 * is logged and refreshes the portfolio pages.
 */
type Result = { ok: true } | { ok: false; error: string };

async function origin() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? (host?.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

const NOT_READY =
  "The placements update hasn’t been applied to this database yet, so pins can’t be saved.";
const message = (e: { code?: string; message: string }) =>
  e.code === "PGRST205" || e.code === "42P01"
    ? NOT_READY
    : e.code === "42501" || /row-level security/i.test(e.message)
      ? "You don't have permission to change this."
      : e.message;

async function done(
  db: Awaited<ReturnType<typeof adminOrThrow>>["db"],
  section: string,
  summary: string,
): Promise<Result> {
  await db
    .from("change_log")
    .insert({ entity: "placements", entity_id: section, action: "update", summary, details: [] });
  refresh(["portfolio", "before-after"], await origin());
  return { ok: true };
}

/** Holds an item in a slot (replacing whatever was pinned there). */
export async function pinItem(section: string, slot: number, itemId: string): Promise<Result> {
  try {
    const { db } = await adminOrThrow();
    const def = placementByKey(section);
    if (!def || !Number.isInteger(slot) || slot < 0 || slot > 500)
      return { ok: false, error: "Unknown slot." };
    const table = def.source === "before-after" ? "before_after" : "portfolio_items";
    const { data: item } = await db.from(table).select("id").eq("id", itemId).maybeSingle();
    if (!item) return { ok: false, error: "That item no longer exists." };
    // One slot per item within a section.
    const clear = await db
      .from("placement_pins")
      .delete()
      .eq("section", section)
      .eq("item_id", itemId);
    if (clear.error) return { ok: false, error: message(clear.error) };
    const { error } = await db
      .from("placement_pins")
      .upsert({ section, slot, item_id: itemId }, { onConflict: "section,slot" });
    if (error) return { ok: false, error: message(error) };
    return done(db, section, `Pinned ${itemId} to ${def.page} · ${def.title}, slot ${slot + 1}`);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Something went wrong." };
  }
}

export async function unpinSlot(section: string, slot: number): Promise<Result> {
  try {
    const { db } = await adminOrThrow();
    const def = placementByKey(section);
    if (!def) return { ok: false, error: "Unknown section." };
    const { error } = await db
      .from("placement_pins")
      .delete()
      .eq("section", section)
      .eq("slot", slot);
    if (error) return { ok: false, error: message(error) };
    return done(db, section, `Unpinned slot ${slot + 1} of ${def.page} · ${def.title}`);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Something went wrong." };
  }
}

/** Clears a section's pins and makes it automatic again (a hero slot is just cleared). */
export async function resetSection(section: string): Promise<Result> {
  try {
    const { db } = await adminOrThrow();
    const def = placementByKey(section);
    if (!def) return { ok: false, error: "Unknown section." };
    const pins = await db.from("placement_pins").delete().eq("section", section);
    if (pins.error) return { ok: false, error: message(pins.error) };
    const mode = await db.from("placement_modes").delete().eq("section", section);
    if (mode.error) return { ok: false, error: message(mode.error) };
    return done(db, section, `Reset ${def.page} · ${def.title} to automatic`);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Something went wrong." };
  }
}

/* ---------- categories ---------- */

export async function renameCategory(id: string, label: string): Promise<Result> {
  try {
    const { db } = await adminOrThrow();
    const name = label.trim();
    if (!name || name.length > 40) return { ok: false, error: "1 to 40 characters." };
    const { error } = await db.from("media_categories").update({ label: name }).eq("id", id);
    if (error)
      return {
        ok: false,
        error: error.code === "23505" ? "That category already exists." : message(error),
      };
    return done(db, id, `Renamed category ${id} to “${name}”`);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Something went wrong." };
  }
}

/** Items in a deleted category keep everything else; they need a category on their next save. */
export async function deleteCategory(id: string): Promise<Result> {
  try {
    const { db } = await adminOrThrow();
    const { error } = await db.from("media_categories").delete().eq("id", id);
    if (error) return { ok: false, error: message(error) };
    return done(db, id, `Deleted category ${id}`);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Something went wrong." };
  }
}
