import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

/**
 * The client portal's Supabase project. While the portal is built (Phase 9) it lives in a separate
 * dev project, set by NEXT_PUBLIC_PORTAL_SUPABASE_URL / _ANON_KEY on the portal branch only.
 * Without them it's the website's project (guide D8: one project once the portal ships).
 */
export const portalUrl =
  process.env.NEXT_PUBLIC_PORTAL_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
export const portalKey =
  process.env.NEXT_PUBLIC_PORTAL_SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "";

/** Supabase as the signed-in client (session in cookies, publishable key, RLS applies). */
export async function portalDb(): Promise<SupabaseClient | null> {
  if (!portalUrl || !portalKey) return null;
  const store = await cookies();
  return createServerClient(portalUrl, portalKey, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        // Server Components can't set cookies; proxy.ts refreshes the session for them.
        try {
          list.forEach(({ name, value, options }) => store.set(name, value, options));
        } catch {}
      },
    },
  });
}
