import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { ACCOUNT_COOKIE } from "@/lib/portal/auth";
import { portalDb } from "@/lib/portal/supabase";

const PAGE: Record<string, string> = { shoot: "shoots", edit: "editing", avatar: "avatars" };

/**
 * The link in every email and WhatsApp: /portal/p/<ref>. Signs in first if needed, switches to the
 * project's account, and opens the project. Never signs anyone in by itself (§8).
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ ref: string }> }) {
  const { ref } = await params;
  const to = (path: string) => NextResponse.redirect(new URL(path, req.nextUrl.origin));
  const db = await portalDb();
  const { data: u } = db ? await db.auth.getUser() : { data: { user: null } };
  if (!db || !u.user) return to(`/portal/login?next=${encodeURIComponent(`/portal/p/${ref}`)}`);
  const { data: p } = await db
    .from("projects")
    .select("type, ref, account_id")
    .eq("ref", ref)
    .maybeSingle();
  if (!p) return to("/portal?missing=1");
  (await cookies()).set(ACCOUNT_COOKIE, p.account_id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/portal",
    maxAge: 60 * 60 * 24 * 365,
  });
  return to(`/portal/${PAGE[p.type] ?? "shoots"}/${encodeURIComponent(p.ref)}`);
}
