"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { headers } from "next/headers";
import type { PropertyPricing } from "@/content/types";
import { refresh } from "@/lib/data/refresh";
import { ALL_TAGS } from "@/lib/data/tags";
import { adminOrThrow } from "./auth";
import { getRow, liveDoc, livePricing } from "./data";
import { docByKey, docFields, PRICING_OTHER_KEYS } from "./docs";
import { diff, getPath, setPath, type Change } from "./fields";
import { checkPricing, pricingChanges, pricingRows } from "./pricing";
import { sectionByKey, type Row } from "./sections";
import { validate, type Errors } from "./validate";

/**
 * Every admin write. Each one runs as the signed-in admin through their own Supabase session, so
 * row-level security decides what is allowed (no service-role key anywhere). After a write, the
 * affected cache tags are refreshed and the change is logged (who comes from the session).
 */
export type Result =
  | { ok: true; id?: string; changes?: Change[]; message?: string }
  | { ok: false; error?: string; errors?: Errors; changes?: Change[] };

async function origin() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? (host?.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

async function log(
  db: SupabaseClient,
  e: { entity: string; entity_id?: string; action: string; summary: string; details?: Change[] },
) {
  // admin_email defaults to the session's email (and RLS rejects any other value).
  await db.from("change_log").insert({ ...e, details: e.details ?? [] });
}

const fail = (err: unknown): Result => ({
  ok: false,
  error:
    err instanceof Error
      ? err.message
      : typeof err === "object" && err && "message" in err
        ? String((err as { message: unknown }).message)
        : "Something went wrong.",
});

function friendly(error: { code?: string; message: string }) {
  if (error.code === "23505") return "That web address is already used by another item.";
  if (error.code === "42501" || /row-level security/i.test(error.message))
    return "You don't have permission to change this.";
  return error.message;
}

const newId = (prefix: string) =>
  `${prefix}-${Array.from(crypto.getRandomValues(new Uint8Array(5)), (b) => "abcdefghijkmnpqrstuvwxyz23456789"[b % 32]).join("")}`;

/* ---------- list sections ---------- */

export async function saveItem(
  sectionKey: string,
  id: string | null,
  input: Record<string, unknown>,
  publish?: boolean,
): Promise<Result> {
  try {
    const { db, role } = await adminOrThrow();
    const section = sectionByKey(sectionKey);
    if (!section) return { ok: false, error: "Unknown section." };
    const { value, errors } = validate(section.fields, input, { isOwner: role === "owner" });
    if (Object.keys(errors).length) return { ok: false, errors };

    // Only the editable columns (first segment of each field name); never id, order or extras.
    const columns = [...new Set(section.fields.map((f) => f.name.split(".")[0]))].filter(
      (c) => !(section.key === "portfolio" && c === "placements"),
    );
    const row: Record<string, unknown> = Object.fromEntries(columns.map((c) => [c, value[c]]));
    if (publish !== undefined) row.published = publish;

    let itemId = id;
    const before = id ? await getRow(db, section, id) : null;
    if (id) {
      if (!before) return { ok: false, error: "This item no longer exists." };
      const { data, error } = await db.from(section.table).update(row).eq("id", id).select("id");
      if (error) return { ok: false, error: friendly(error) };
      if (!data?.length) return { ok: false, error: "You don't have permission to change this." };
    } else {
      itemId = newId(section.idPrefix);
      const { data: last } = await db
        .from(section.table)
        .select("sort_order")
        .order("sort_order", { ascending: false })
        .limit(1)
        .maybeSingle();
      const { error } = await db.from(section.table).insert({
        ...row,
        id: itemId,
        published: publish ?? false,
        sort_order: (last?.sort_order ?? 0) + 1,
      });
      if (error) return { ok: false, error: friendly(error) };
    }

    if (section.key === "portfolio")
      await savePlacements(db, itemId!, value.placements as string[]);
    if (section.key === "before-after" && value.in_hero)
      await db.from("before_after").update({ in_hero: false }).neq("id", itemId!);

    const title = section.title_of({ ...row, id: itemId! } as Row);
    const changes = before ? diff(section.fields, before, value) : [];
    await log(db, {
      entity: section.key,
      entity_id: itemId!,
      action: !id
        ? "create"
        : publish === true
          ? "publish"
          : publish === false
            ? "unpublish"
            : "update",
      summary: `${!id ? "Added" : "Updated"} ${section.singular} “${title}”`,
      details: changes,
    });
    refresh(section.tags, await origin());
    return { ok: true, id: itemId! };
  } catch (err) {
    return fail(err);
  }
}

/** Placements are their own rows; new ones go to the end of that placement. */
async function savePlacements(db: SupabaseClient, itemId: string, wanted: string[]) {
  const { data: current } = await db
    .from("portfolio_placements")
    .select("placement")
    .eq("item_id", itemId);
  const have = (current ?? []).map((r) => r.placement as string);
  const drop = have.filter((p) => !wanted.includes(p));
  if (drop.length)
    await db.from("portfolio_placements").delete().eq("item_id", itemId).in("placement", drop);
  for (const placement of wanted.filter((p) => !have.includes(p))) {
    const { data: last } = await db
      .from("portfolio_placements")
      .select("sort_order")
      .eq("placement", placement)
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle();
    const { error } = await db
      .from("portfolio_placements")
      .insert({ item_id: itemId, placement, sort_order: (last?.sort_order ?? 0) + 1 });
    if (error) throw new Error(friendly(error));
  }
}

export async function setPublished(
  sectionKey: string,
  id: string,
  published: boolean,
): Promise<Result> {
  try {
    const { db } = await adminOrThrow();
    const section = sectionByKey(sectionKey);
    if (!section) return { ok: false, error: "Unknown section." };
    const { data, error } = await db
      .from(section.table)
      .update({ published })
      .eq("id", id)
      .select()
      .maybeSingle();
    if (error) return { ok: false, error: friendly(error) };
    if (!data) return { ok: false, error: "This item no longer exists." };
    await log(db, {
      entity: section.key,
      entity_id: id,
      action: published ? "publish" : "unpublish",
      summary: `${published ? "Published" : "Unpublished"} ${section.singular} “${section.title_of(data as Row)}”`,
    });
    refresh(section.tags, await origin());
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function deleteItem(sectionKey: string, id: string): Promise<Result> {
  try {
    const { db } = await adminOrThrow();
    const section = sectionByKey(sectionKey);
    if (!section) return { ok: false, error: "Unknown section." };
    const { data, error } = await db
      .from(section.table)
      .delete()
      .eq("id", id)
      .select()
      .maybeSingle();
    if (error) return { ok: false, error: friendly(error) };
    if (!data) return { ok: false, error: "This item no longer exists." };
    await log(db, {
      entity: section.key,
      entity_id: id,
      action: "delete",
      summary: `Deleted ${section.singular} “${section.title_of(data as Row)}”`,
    });
    refresh(section.tags, await origin());
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

/** New order of a list, or of one placement/page within it. */
export async function reorder(sectionKey: string, ids: string[], within?: string): Promise<Result> {
  try {
    const { db } = await adminOrThrow();
    const section = sectionByKey(sectionKey);
    if (!section) return { ok: false, error: "Unknown section." };
    const perValue = within && section.filter?.orderPerValue;
    if (perValue && !section.filter!.options.some((o) => o.value === within))
      return { ok: false, error: "Unknown placement." };
    const results = await Promise.all(
      ids.map(async (id, i) => {
        if (perValue && section.key === "portfolio")
          return db
            .from("portfolio_placements")
            .update({ sort_order: i + 1 })
            .eq("item_id", id)
            .eq("placement", within);
        if (perValue && section.key === "stats") {
          const { data } = await db.from("stats").select("placement_order").eq("id", id).single();
          return db
            .from("stats")
            .update({ placement_order: { ...(data?.placement_order ?? {}), [within!]: i + 1 } })
            .eq("id", id);
        }
        return db
          .from(section.table)
          .update({ sort_order: i + 1 })
          .eq("id", id);
      }),
    );
    const error = results.find((r) => r.error)?.error;
    if (error) return { ok: false, error: friendly(error) };
    await log(db, {
      entity: section.key,
      action: "reorder",
      summary: `Reordered ${section.title.toLowerCase()}${within ? ` (${section.filter?.options.find((o) => o.value === within)?.label ?? within})` : ""}`,
    });
    refresh(section.tags, await origin());
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

/* ---------- documents: settings, other prices, AI avatar hero ---------- */

/** Overlay only the form's fields onto the live value, so nothing else can be injected. */
async function prepareDoc(db: SupabaseClient, key: string, input: unknown, isOwner: boolean) {
  const doc = docByKey(key);
  if (!doc) throw new Error("Unknown document.");
  if (doc.ownerOnly && !isOwner) throw new Error("Only the Owner can change this.");
  const live = await liveDoc(db, doc);
  const fields = docFields(doc);
  const merged = fields.reduce<Record<string, unknown>>(
    (acc, f) => setPath(acc, f.name, getPath(input, f.name)),
    live,
  );
  const { value, errors } = validate(fields, merged, { emptyAs: undefined, isOwner });
  return { doc, live, value, errors, changes: diff(fields, live, value) };
}

export async function saveDocDraft(key: string, input: unknown): Promise<Result> {
  try {
    const { db, role, email } = await adminOrThrow();
    const { value, errors, changes } = await prepareDoc(db, key, input, role === "owner");
    if (Object.keys(errors).length) return { ok: false, errors };
    const { error } = await db.from("drafts").upsert({ key, value, updated_by: email });
    if (error) return { ok: false, error: friendly(error) };
    return { ok: true, changes };
  } catch (err) {
    return fail(err);
  }
}

export async function discardDocDraft(key: string): Promise<Result> {
  try {
    const { db } = await adminOrThrow();
    const { error } = await db.from("drafts").delete().eq("key", key);
    if (error) return { ok: false, error: friendly(error) };
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

/** Without `confirmed`, only returns what would change (for the confirmation dialog). */
export async function publishDoc(key: string, input: unknown, confirmed: boolean): Promise<Result> {
  try {
    const { db, role } = await adminOrThrow();
    const { doc, value, errors, changes } = await prepareDoc(db, key, input, role === "owner");
    if (Object.keys(errors).length) return { ok: false, errors };
    if (!confirmed) return { ok: true, changes };
    if (!changes.length) return { ok: false, error: "Nothing has changed." };

    const writes =
      doc.key === "pricing_other"
        ? (Object.entries(PRICING_OTHER_KEYS) as [keyof typeof PRICING_OTHER_KEYS, string][]).map(
            ([prop, k]) =>
              db.from("pricing_other").update({ value: value[prop] }).eq("key", k).select(),
          )
        : [db.from("site_settings").update({ value }).eq("key", doc.key).select()];
    for (const w of await Promise.all(writes)) {
      if (w.error) return { ok: false, error: friendly(w.error) };
      if (!w.data?.length) return { ok: false, error: "You don't have permission to change this." };
    }
    await db.from("drafts").delete().eq("key", key);
    await log(db, {
      entity: doc.key === "pricing_other" ? "pricing" : doc.key,
      entity_id: doc.key,
      action: "publish",
      summary: `${doc.title}: published ${changes.length} change${changes.length === 1 ? "" : "s"}`,
      details: changes,
    });
    refresh(doc.tags, await origin());
    return { ok: true, changes };
  } catch (err) {
    return fail(err);
  }
}

/* ---------- property shoot prices ---------- */

export async function savePricingDraft(value: PropertyPricing): Promise<Result> {
  try {
    const { db, email } = await adminOrThrow({ owner: true });
    const problems = checkPricing(value);
    if (problems.length) return { ok: false, error: problems.join("\n") };
    const { error } = await db
      .from("drafts")
      .upsert({ key: "pricing_property", value, updated_by: email });
    if (error) return { ok: false, error: friendly(error) };
    return { ok: true, changes: pricingChanges(await livePricing(db), value) };
  } catch (err) {
    return fail(err);
  }
}

/** Without `confirmed`, only returns the old → new list for the confirmation dialog. */
export async function publishPricing(value: PropertyPricing, confirmed: boolean): Promise<Result> {
  try {
    const { db } = await adminOrThrow({ owner: true });
    const problems = checkPricing(value);
    if (problems.length) return { ok: false, error: problems.join("\n") };
    const changes = pricingChanges(await livePricing(db), value);
    if (!confirmed) return { ok: true, changes };
    if (!changes.length) return { ok: false, error: "Nothing has changed." };
    const rows = pricingRows(value);
    const { error } = await db.rpc("publish_property_pricing", {
      ...rows,
      summary: `Property shoot prices: published ${changes.length} change${changes.length === 1 ? "" : "s"}`,
      details: changes,
    });
    if (error) return { ok: false, error: friendly(error) };
    refresh(["pricing"], await origin());
    return { ok: true, changes };
  } catch (err) {
    return fail(err);
  }
}

/* ---------- proof strip, admins ---------- */

export async function setProofStrip(page: string, enabled: boolean): Promise<Result> {
  try {
    const { db } = await adminOrThrow();
    const { data, error } = await db
      .from("proof_strip_pages")
      .update({ enabled })
      .eq("page", page)
      .select();
    if (error) return { ok: false, error: friendly(error) };
    if (!data?.length) return { ok: false, error: "Unknown page." };
    await log(db, {
      entity: "proof-strip",
      entity_id: page,
      action: "update",
      summary: `Proof strip ${enabled ? "shown" : "hidden"} on ${page}`,
    });
    refresh(["site"], await origin());
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function addAdmin(email: string, role: "owner" | "editor"): Promise<Result> {
  try {
    const { db } = await adminOrThrow({ owner: true });
    const e = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e))
      return { ok: false, errors: { email: "Enter an email address." } };
    if (!["owner", "editor"].includes(role)) return { ok: false, error: "Unknown role." };
    const { error } = await db.from("admins").upsert({ email: e, role });
    if (error) return { ok: false, error: friendly(error) };
    await log(db, {
      entity: "admins",
      entity_id: e,
      action: "update",
      summary: `${e} is now ${role === "owner" ? "an Owner" : "an Editor"}`,
    });
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function removeAdmin(email: string): Promise<Result> {
  try {
    const me = await adminOrThrow({ owner: true });
    if (email === me.email) return { ok: false, error: "You can't remove yourself." };
    const { error } = await me.db.from("admins").delete().eq("email", email);
    if (error) return { ok: false, error: friendly(error) };
    await log(me.db, {
      entity: "admins",
      entity_id: email,
      action: "delete",
      summary: `Removed ${email} from admins`,
    });
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

/** Dashboard button: re-render every page from the database (e.g. after editing in Supabase). */
export async function refreshWholeSite(): Promise<Result> {
  try {
    await adminOrThrow();
    refresh(ALL_TAGS, await origin());
    return { ok: true, message: "The whole site is refreshing; give it a few seconds." };
  } catch (err) {
    return fail(err);
  }
}

/* ---------- leads ---------- */

export async function updateLead(
  ref: string,
  patch: { status?: string; notes?: string },
): Promise<Result> {
  try {
    const { db } = await adminOrThrow({ owner: true });
    const { LEAD_STATUSES } = await import("./leads");
    const row: Record<string, unknown> = {};
    if (patch.status !== undefined) {
      if (!(LEAD_STATUSES as readonly string[]).includes(patch.status))
        return { ok: false, error: "Unknown status." };
      row.status = patch.status;
    }
    if (patch.notes !== undefined) {
      if (patch.notes.length > 4000)
        return { ok: false, error: "Keep notes under 4,000 characters." };
      row.notes = patch.notes.trim() || null;
    }
    const { data, error } = await db.from("leads").update(row).eq("ref", ref).select("ref");
    if (error) return { ok: false, error: friendly(error) };
    if (!data?.length) return { ok: false, error: "Lead not found." };
    await log(db, {
      entity: "lead",
      entity_id: ref,
      action: "update",
      summary: patch.status ? `Lead ${ref} marked ${patch.status}` : `Notes updated on lead ${ref}`,
    });
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}
