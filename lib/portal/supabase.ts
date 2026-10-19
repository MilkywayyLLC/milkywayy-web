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

/**
 * Whether the portal's project has phone sign-in switched on (a phone provider set up in
 * Supabase). The login page hides WhatsApp when it isn't, e.g. on a project without Twilio.
 */
export async function phoneSignInEnabled(): Promise<boolean> {
  if (!portalUrl || !portalKey) return false;
  try {
    const r = await fetch(`${portalUrl}/auth/v1/settings`, {
      headers: { apikey: portalKey },
      next: { revalidate: 300 },
    });
    if (!r.ok) return false;
    return Boolean(((await r.json()) as { external?: { phone?: boolean } }).external?.phone);
  } catch {
    return false;
  }
}
