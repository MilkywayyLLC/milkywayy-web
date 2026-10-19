import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Agency teams (owner, 17 Oct 2026): a shoot or listing has an optional Agent (a contact) and a
 * "Share with" list of teammates. The database decides who sees what; these only label it.
 */
export type Teammate = { id: string; name: string };

/** Teammates to share with (Owner/Admins read the team; others get an empty list). */
export async function teammates(db: SupabaseClient, account: string): Promise<Teammate[]> {
  const { data: ms } = await db.from("account_members").select("user_id").eq("account_id", account);
  const ids = (ms ?? []).map((m) => m.user_id as string);
  if (!ids.length) return [];
  const { data: ps } = await db
    .from("profiles")
    .select("user_id, full_name, email")
    .in("user_id", ids);
  return ids
    .map((id) => {
      const p = ps?.find((x) => x.user_id === id);
      return { id, name: p?.full_name || p?.email || "Team member" };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** A contact's name, for "Agent: …". */
export async function contactName(db: SupabaseClient, id: string | null | undefined) {
  if (!id) return null;
  const { data } = await db.from("contacts").select("name").eq("id", id).maybeSingle();
  return (data?.name as string | undefined) ?? null;
}

export const sharedLabel = (n: number | undefined) => (n ? `Shared with ${n}` : null);
