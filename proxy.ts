import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { portalKey, portalUrl } from "@/lib/portal/supabase";

/**
 * Runs only for /admin and /portal. Keeps the signed-in Supabase session fresh (rotating the
 * access token in cookies before pages read it) and marks every response noindex on top of
 * robots.txt. The portal may use its own Supabase project while it's built (lib/portal/supabase).
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const portal = request.nextUrl.pathname.startsWith("/portal");
  const url = portal ? portalUrl : process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = portal ? portalKey : process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (url && key) {
    const db = createServerClient(url, key, {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (list, headers) => {
          list.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
          Object.entries(headers).forEach(([k, v]) => response.headers.set(k, v));
        },
      },
    });
    await db.auth.getClaims();
  }
  response.headers.set("X-Robots-Tag", "noindex, nofollow");
  return response;
}

export const config = { matcher: ["/admin", "/admin/:path*", "/portal", "/portal/:path*"] };
