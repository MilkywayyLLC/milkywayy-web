import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "./env";

/**
 * Portal tests run against the portal's Supabase project (the dev project while Phase 9 is built),
 * through the secret-gated e2e_* helpers that exist only there (supabase/dev/portal_e2e.sql).
 * Test users are e2e-portal-<run>-<name>@example.com and are deleted afterwards.
 */
export const hasPortal = !!(
  env.NEXT_PUBLIC_PORTAL_SUPABASE_URL &&
  env.NEXT_PUBLIC_PORTAL_SUPABASE_ANON_KEY &&
  env.E2E_PORTAL_SECRET
);

export const PASSWORD = "Portal-e2e-pass-2026";

export const portalClient = (): SupabaseClient =>
  createClient(env.NEXT_PUBLIC_PORTAL_SUPABASE_URL, env.NEXT_PUBLIC_PORTAL_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

/** A unique prefix per test file run, e.g. e2e-portal-m1x2k9abc. */
export const newRun = () =>
  `e2e-portal-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

const secret = () => env.E2E_PORTAL_SECRET;

async function must<T = unknown>(
  p: PromiseLike<{ data: unknown; error: { message: string } | null }>,
) {
  const { data, error } = await p;
  if (error) throw new Error(error.message);
  return data as T;
}

export async function createUser(run: string, name: string, confirmed = true) {
  const email = `${run}-${name}@example.com`;
  await must(
    portalClient().rpc("e2e_create_user", {
      p_secret: secret(),
      p_email: email,
      p_password: PASSWORD,
      p_confirmed: confirmed,
    }),
  );
  return email;
}

export const confirmEmail = (email: string) =>
  must(portalClient().rpc("e2e_confirm_email", { p_secret: secret(), p_email: email }));

/** A website booking (lead + one property line) made with this email. Returns its ref. */
export const addBooking = (email: string, type = "property") =>
  must<string>(
    portalClient().rpc("e2e_add_booking", { p_secret: secret(), p_email: email, p_type: type }),
  );

export const cleanup = (run: string) =>
  must(portalClient().rpc("e2e_cleanup", { p_secret: secret(), p_prefix: run }));

/** Supabase signed in as a test user. */
export async function signedIn(email: string) {
  const db = portalClient();
  const { error } = await db.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw new Error(`${email}: ${error.message}`);
  return db;
}

/** Supabase test number (Authentication → Phone → Test Phone Numbers): code 123456, never sent. */
export const TEST_PHONE = "+971500000001";
export const TEST_CODE = "123456";

export const addPhoneBooking = (phone = TEST_PHONE) =>
  must<string>(portalClient().rpc("e2e_add_phone_booking", { p_secret: secret(), p_phone: phone }));

export const cleanupPhone = (phone = TEST_PHONE) =>
  must(portalClient().rpc("e2e_cleanup_phone", { p_secret: secret(), p_phone: phone }));

/** Sign in through the real login page with email + password; lands wherever the portal sends them. */
export async function signInUI(page: import("@playwright/test").Page, email: string) {
  await page.goto("/portal/login?method=password");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/portal/login"));
}

/** Admin gate for the portal_admin_* functions (dev project), as the server calls them. */
export const adminRpc = (
  fn: string,
  args: Record<string, unknown>,
  secret = env.PORTAL_ADMIN_SECRET,
) => portalClient().rpc(fn, { p_secret: secret, p_actor: "e2e-admin@example.com", ...args });
export const hasPortalAdmin = hasPortal && !!env.PORTAL_ADMIN_SECRET;

/** Phone sign-in is behind a switch (lib/portal/flags.ts); its UI tests run only when it's on. */
export const phoneSignInOn = env.NEXT_PUBLIC_PORTAL_PHONE_SIGNIN === "on";

/** Sets a known email sign-in code for a test user (dev-only helper; no email is read). */
export const setEmailCode = (email: string, code: string) =>
  must(portalClient().rpc("e2e_email_code", { p_secret: secret(), p_email: email, p_code: code }));
