import type { SupabaseClient } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { cache } from "react";
import { sessionDb } from "@/lib/supabase/server";

export type Role = "owner" | "editor";

/** The Playwright test accounts (e2e-…@example.com). Their edits are logged but kept off the dashboard. */
export const TEST_ACCOUNTS = "e2e-%@example.com";

export type AdminState =
  | { state: "signed-out" }
  | { state: "no-access"; email: string }
  /** Owner signed in with a password but not yet with a code (enrol = no authenticator set up yet). */
  | { state: "mfa-enroll" | "mfa-verify"; email: string; role: Role }
  | { state: "ok"; email: string; role: Role; db: SupabaseClient };

/**
 * Who is signing in to /admin, once per request. The admins table is the allow-list; the
 * database enforces the same rules (private.admin_role: an Owner without a code is no admin).
 */
export const getAdmin = cache(async (): Promise<AdminState> => {
  const db = await sessionDb();
  if (!db) return { state: "signed-out" };
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user?.email) return { state: "signed-out" };
  const email = user.email.toLowerCase();
  const { data: row } = await db.from("admins").select("role").eq("email", email).maybeSingle();
  if (!row) return { state: "no-access", email };
  const role = row.role as Role;
  if (role === "owner") {
    const { data: aal } = await db.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aal?.currentLevel !== "aal2")
      return { state: aal?.nextLevel === "aal2" ? "mfa-verify" : "mfa-enroll", email, role };
  }
  return { state: "ok", email, role, db };
});

/** For admin pages: sends anyone who isn't a fully signed-in admin to the right screen. */
export async function requireAdmin(
  opts: { owner?: boolean } = {},
): Promise<Extract<AdminState, { state: "ok" }>> {
  const a = await getAdmin();
  if (a.state === "signed-out") return redirect("/admin/login");
  if (a.state === "no-access") return redirect("/admin/no-access");
  if (a.state !== "ok") return redirect("/admin/two-factor");
  if (opts.owner && a.role !== "owner") return redirect("/admin?owner-only=1");
  return a;
}

/** For server actions and route handlers: throws instead of redirecting. */
export async function adminOrThrow(opts: { owner?: boolean } = {}) {
  const a = await getAdmin();
  if (a.state !== "ok") throw new Error("Not signed in as an admin.");
  if (opts.owner && a.role !== "owner") throw new Error("Only the Owner can do this.");
  return a;
}
