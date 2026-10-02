import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { safeNext } from "@/lib/portal/auth";
import { portalDb } from "@/lib/portal/supabase";
import { syncAfterSignIn } from "@/lib/portal/sync";

/**
 * Where links in portal emails land (confirm email, reset password). Handles both link styles:
 * ?code= (Supabase's default, same browser) and ?token_hash=&type= (custom email template,
 * works on any device). Opening the link on another device still confirms the email (Supabase
 * does that before redirecting), so then we just ask them to sign in.
 */
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const next = safeNext(url.searchParams.get("next"));
  const to = (path: string) => NextResponse.redirect(new URL(path, url.origin));
  if (url.searchParams.get("error")) return to("/portal/login?link=expired");

  const db = await portalDb();
  if (!db) return to("/portal/login");
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;

  const { error } = code
    ? await db.auth.exchangeCodeForSession(code)
    : tokenHash && type
      ? await db.auth.verifyOtp({ token_hash: tokenHash, type })
      : { error: new Error("no code") };
  if (error)
    return to(
      next === "/portal/reset" ? "/portal/login?link=expired" : "/portal/login?confirmed=1",
    );

  const claimed = await syncAfterSignIn(db);
  return to(claimed ? `${next}${next.includes("?") ? "&" : "?"}claimed=${claimed}` : next);
}
