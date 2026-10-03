import type { SupabaseClient } from "@supabase/supabase-js";
import { price } from "@/lib/share";
import type { PurposeKey } from "./listings";
import { initials } from "./shell";

/** The listings and contacts a collection can use (RLS: the ones this person sees). */
export async function collectionChoices(db: SupabaseClient, account: string) {
  const [{ data: ls }, { data: cs }] = await Promise.all([
    db
      .from("listings")
      .select("id, title, purpose, price, location")
      .eq("account_id", account)
      .order("created_at", { ascending: false }),
    db
      .from("contacts")
      .select("id, name, role, is_default")
      .eq("account_id", account)
      .order("is_default", { ascending: false })
      .order("name"),
  ]);
  return {
    listings: (ls ?? []).map((l) => ({
      id: l.id as string,
      title: l.title as string,
      meta: [price(l.price, "AED", l.purpose as PurposeKey), l.location]
        .filter(Boolean)
        .join(" · "),
    })),
    contacts: (cs ?? []).map((c) => ({
      id: c.id as string,
      name: c.name as string,
      role: c.role as string | null,
      initials: initials(c.name),
    })),
  };
}
