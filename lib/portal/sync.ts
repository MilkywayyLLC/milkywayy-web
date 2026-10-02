import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * After any sign-in: join accounts this verified email was invited to, then attach earlier
 * website bookings made with it (§3.2, §3.5). Returns how many bookings were attached.
 */
export async function syncAfterSignIn(db: SupabaseClient) {
  const inv = await db.rpc("accept_my_invites");
  if (inv.error) console.error("[portal] accept_my_invites:", inv.error.message);
  const claim = await db.rpc("claim_my_bookings");
  if (claim.error) console.error("[portal] claim_my_bookings:", claim.error.message);
  return ((claim.data?.claimed as string[] | undefined) ?? []).length;
}
