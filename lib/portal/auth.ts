import type { SupabaseClient, User } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { portalDb } from "./supabase";

export type Role = "owner" | "admin" | "member";
export type Account = {
  id: string;
  type: "individual" | "company";
  name: string;
  industry: string | null;
  industry_other: string | null;
  volume_note: string | null;
  currency: "AED" | "USD";
  member_visibility: "own" | "all";
  services_interest: string[];
};
export type Membership = { role: Role; account: Account };

/** The account the client last chose (account switcher, step 4); else their own, else the first. */
export const ACCOUNT_COOKIE = "mw-portal-account";

export type PortalState =
  | { state: "signed-out" }
  | { state: "signed-in"; db: SupabaseClient; user: User; memberships: Membership[] };

/** Who is using the portal, once per request. Every read after this runs under RLS as them. */
export const getPortal = cache(async (): Promise<PortalState> => {
  const db = await portalDb();
  if (!db) return { state: "signed-out" };
  let { data, error } = await db.auth.getUser();
  if (
    error &&
    error.name !== "AuthSessionMissingError" &&
    !/session|jwt|token/i.test(error.message)
  )
    ({ data, error } = await db.auth.getUser());
  const user = data.user;
  if (!user || user.is_anonymous) return { state: "signed-out" };
  const { data: rows } = await db
    .from("account_members")
    .select(
      "role, created_at, account:accounts(id, type, name, industry, industry_other, volume_note, currency, member_visibility, services_interest)",
    )
    .eq("user_id", user.id)
    .order("created_at");
  const memberships = ((rows ?? []) as unknown as Membership[])
    .filter((m) => m.account)
    .sort((a, b) => Number(b.role === "owner") - Number(a.role === "owner"));
  return { state: "signed-in", db, user, memberships };
});

/** For portal pages: signed in, or off to the login page (coming back here afterwards). */
export async function requirePortalUser(next = "/portal") {
  const p = await getPortal();
  if (p.state !== "signed-in") redirect(`/portal/login?next=${encodeURIComponent(next)}`);
  return p;
}

/** Signed in with an account; no account yet means onboarding first. */
export async function requireAccount(next = "/portal") {
  const p = await requirePortalUser(next);
  if (!p.memberships.length) redirect("/portal/welcome");
  const chosen = (await cookies()).get(ACCOUNT_COOKIE)?.value;
  const current = p.memberships.find((m) => m.account.id === chosen) ?? p.memberships[0];
  return { ...p, current };
}

/** Only same-site portal paths, so ?next= can't send anyone elsewhere. */
export function safeNext(next: unknown, fallback = "/portal") {
  const s = typeof next === "string" ? next : "";
  return /^\/portal(\/[\w\-./?=&%]*)?$/.test(s) && !s.startsWith("//") ? s : fallback;
}
