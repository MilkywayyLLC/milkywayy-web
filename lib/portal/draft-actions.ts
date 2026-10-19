"use server";

import { revalidatePath } from "next/cache";
import { requireAccount } from "./auth";

/**
 * Drafts (owner, 10 Oct 2026): listing, booking, editing and avatar forms autosave as people type,
 * one draft per form, person and account, in the database (never the browser). A draft goes once
 * its form is sent.
 */
export type DraftKind = "listing" | "booking" | "edit" | "avatar";
export type Draft = { data: Record<string, unknown>; updated_at: string };
const KINDS: DraftKind[] = ["listing", "booking", "edit", "avatar"];

export async function loadDraft(kind: DraftKind): Promise<Draft | null> {
  if (!KINDS.includes(kind)) return null;
  const { db, user, current } = await requireAccount("/portal");
  const { data } = await db
    .from("portal_drafts")
    .select("data, updated_at")
    .eq("account_id", current.account.id)
    .eq("user_id", user.id)
    .eq("kind", kind)
    .maybeSingle();
  return (data as Draft | null) ?? null;
}

export async function saveDraft(kind: DraftKind, data: Record<string, unknown>) {
  if (!KINDS.includes(kind)) return { ok: false };
  const { db, user, current } = await requireAccount("/portal");
  const { error } = await db.from("portal_drafts").upsert({
    account_id: current.account.id,
    user_id: user.id,
    kind,
    data,
    updated_at: new Date().toISOString(),
  });
  if (error) console.error("[portal] draft save:", error.message);
  return { ok: !error };
}

export async function discardDraft(kind: DraftKind) {
  if (!KINDS.includes(kind)) return { ok: false };
  const { db, user, current } = await requireAccount("/portal");
  await db
    .from("portal_drafts")
    .delete()
    .eq("account_id", current.account.id)
    .eq("user_id", user.id)
    .eq("kind", kind);
  revalidatePath("/portal", "layout");
  return { ok: true };
}

/** Every draft of the signed-in person on this account (the list pages' "Drafts" row). */
export async function myDrafts(): Promise<(Draft & { kind: DraftKind })[]> {
  // Fail safe: no drafts row rather than a broken page.
  try {
    const { db, user, current } = await requireAccount("/portal");
    const { data, error } = await db
      .from("portal_drafts")
      .select("kind, data, updated_at")
      .eq("account_id", current.account.id)
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false });
    if (error) console.error("[portal] drafts:", error.message);
    return (data ?? []) as (Draft & { kind: DraftKind })[];
  } catch (e) {
    if ((e as { digest?: string })?.digest?.startsWith("NEXT_REDIRECT")) throw e;
    console.error("[portal] drafts:", e);
    return [];
  }
}
