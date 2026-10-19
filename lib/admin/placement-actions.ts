"use server";

import { headers } from "next/headers";
import { refresh } from "@/lib/data/refresh";
import {
  byLibrary,
  isHeroTemplate,
  PAGE_HEROES,
  placementByKey,
  resolve,
  type HeroTemplate,
  type OrderKey,
} from "@/lib/placements";
import { adminOrThrow } from "./auth";
import { libRow, listRows, placementState } from "./data";
import { sectionByKey } from "./sections";

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
  e.code === "PGRST205" ||
  e.code === "42P01" ||
  e.code === "42703" ||
  /library_order|placement_heroes/.test(e.message)
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
    // A before/after hero takes two library photos: slot 0 Before, slot 1 After.
    if (def.source === "before-after" && slot > 1) return { ok: false, error: "Unknown slot." };
    const { data: item } = await db
      .from("portfolio_items")
      .select("id")
      .eq("id", itemId)
      .maybeSingle();
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

/* ---------- Admin → Pages / Library (26 Oct 2026) ---------- */

/** Saves a section's order: its items become pins, in this order (a before/after pair too). */
export async function setSectionOrder(section: string, ids: string[]): Promise<Result> {
  try {
    const { db } = await adminOrThrow();
    const def = placementByKey(section);
    if (!def || ids.length > 500 || new Set(ids).size !== ids.length)
      return { ok: false, error: "Unknown section." };
    const clear = await db.from("placement_pins").delete().eq("section", section);
    if (clear.error) return { ok: false, error: message(clear.error) };
    if (ids.length) {
      const { error } = await db
        .from("placement_pins")
        .insert(ids.map((item_id, slot) => ({ section, slot, item_id })));
      if (error) return { ok: false, error: message(error) };
    }
    return done(db, section, `Reordered ${def.page} · ${def.title}`);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Something went wrong." };
  }
}

/**
 * Auto-fill on or off. Off pins what the section shows now, so nothing changes on the site until
 * someone edits it; on keeps the pins and fills the rest from the Library.
 */
export async function setAutoFill(section: string, auto: boolean): Promise<Result> {
  try {
    const { db } = await adminOrThrow();
    const def = placementByKey(section);
    if (!def || def.hero || def.standalone)
      return { ok: false, error: "This block is always picked by hand." };
    if (!auto) {
      const lib = (await listRows(db, sectionByKey("portfolio")!)).map(libRow);
      const r = resolve(def, lib, await placementState(db, lib));
      const clear = await db.from("placement_pins").delete().eq("section", section);
      if (clear.error) return { ok: false, error: message(clear.error) };
      if (r.items.length) {
        const { error } = await db
          .from("placement_pins")
          .insert(r.items.map((x, slot) => ({ section, slot, item_id: x.id })));
        if (error) return { ok: false, error: message(error) };
      }
    }
    const { error } = await db
      .from("placement_modes")
      .upsert({ section, mode: auto ? "auto" : "manual", updated_at: new Date().toISOString() });
    if (error) return { ok: false, error: message(error) };
    return done(db, section, `Auto-fill ${auto ? "on" : "off"} for ${def.page} · ${def.title}`);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Something went wrong." };
  }
}

export async function setHeroTemplate(page: string, template: HeroTemplate): Promise<Result> {
  try {
    const { db } = await adminOrThrow();
    const hero = PAGE_HEROES.find((h) => h.page === page);
    if (!hero || !isHeroTemplate(template) || !hero.templates.includes(template))
      return { ok: false, error: "That template isn’t available on this page." };
    const { error } = await db
      .from("placement_heroes")
      .upsert({ section: hero.key, template, updated_at: new Date().toISOString() });
    if (error) return { ok: false, error: message(error) };
    return done(db, hero.key, `Set the ${page} hero template to ${template}`);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Something went wrong." };
  }
}

/**
 * The Library's order after a drag within a filter: the filtered items trade places among the
 * positions they already held, so everything outside the filter stays where it is.
 */
export async function setLibraryOrder(ids: string[]): Promise<Result> {
  try {
    const { db } = await adminOrThrow();
    const { data, error } = await db
      .from("portfolio_items")
      .select("id, library_order, created_at, sort_order");
    if (error) return { ok: false, error: message(error) };
    const rows = (data ?? []).map((r) => ({
      id: r.id as string,
      before: (r.library_order as number | null) ?? null,
      libraryOrder: (r.library_order as number | null) ?? undefined,
      createdAt: (r.created_at as string | null) ?? undefined,
      sortOrder: (r.sort_order as number | null) ?? 0,
    }));
    const order: (OrderKey & { id: string; before: number | null })[] = rows.sort(byLibrary);
    const subset = new Set(ids);
    const known = new Set(order.map((r) => r.id));
    const picked = ids.filter((id) => known.has(id));
    if (new Set(picked).size !== picked.length || picked.length !== subset.size)
      return { ok: false, error: "Some of those items no longer exist." };
    const byId = new Map(order.map((r) => [r.id, r]));
    let n = 0;
    const next = order.map((r) => (subset.has(r.id) ? byId.get(picked[n++])! : r));
    const changed = next
      .map((r, i) => ({ id: r.id, i, before: byId.get(r.id)!.before }))
      .filter((x) => x.before !== x.i);
    for (let k = 0; k < changed.length; k += 20) {
      const results = await Promise.all(
        changed
          .slice(k, k + 20)
          .map((x) => db.from("portfolio_items").update({ library_order: x.i }).eq("id", x.id)),
      );
      const failed = results.find((r) => r.error);
      if (failed?.error) return { ok: false, error: message(failed.error) };
    }
    return done(db, "library", "Reordered the Library");
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Something went wrong." };
  }
}

/** The Library's "On Work page" switch (the old "work" placement row follows, for a rollback). */
export async function setShowOnWork(id: string, on: boolean): Promise<Result> {
  try {
    const { db } = await adminOrThrow();
    const { data, error } = await db
      .from("portfolio_items")
      .update({ show_on_work: on })
      .eq("id", id)
      .select("title")
      .maybeSingle();
    if (error) return { ok: false, error: message(error) };
    if (!data) return { ok: false, error: "This item no longer exists." };
    if (!on) {
      await db.from("portfolio_placements").delete().eq("item_id", id).eq("placement", "work");
    } else {
      await db.from("portfolio_placements").upsert(
        { item_id: id, placement: "work", sort_order: 9999 },
        {
          onConflict: "item_id,placement",
          ignoreDuplicates: true,
        },
      );
    }
    return done(
      db,
      id,
      `${on ? "Added" : "Removed"} “${data.title}” ${on ? "to" : "from"} the Work page`,
    );
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Something went wrong." };
  }
}
