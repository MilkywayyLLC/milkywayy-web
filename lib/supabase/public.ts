import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Read-only Supabase client for public content (anon/publishable key, so row-level security
 * applies: only published rows). Returns null when the project isn't configured, in which case
 * the data layer serves the seed content from content/.
 *
 * SUPABASE_SERVER_URL (optional, server-only, read at runtime) overrides the URL for these reads.
 * The fallback test points it at a proxy that can make the database fail on demand.
 */
let client: SupabaseClient | null | undefined;

export function publicDb(): SupabaseClient | null {
  if (client !== undefined) return client;
  const url = process.env.SUPABASE_SERVER_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  client = url && key ? createClient(url, key, { auth: { persistSession: false } }) : null;
  return client;
}
