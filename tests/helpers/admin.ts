import { expect, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "./env";
import { nextWindow, savedSecret, totp } from "./totp";

export const OWNER = "tests/.auth/owner.json";
export const EDITOR = "tests/.auth/editor.json";
export const STRANGER = "tests/.auth/stranger.json";

/** A short unique tag for this run, so test items never clash with real content. */
export const RUN = `E2E ${Date.now().toString(36).slice(-5).toUpperCase()}`;

/** Supabase as a given test account (password only = aal1). */
export async function dbAs(who: "OWNER" | "EDITOR" | "STRANGER"): Promise<SupabaseClient> {
  const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await db.auth.signInWithPassword({
    email: env[`E2E_${who}_EMAIL`],
    password: env[`E2E_${who}_PASSWORD`],
  });
  if (error) throw error;
  return db;
}

/** The e2e Owner with two-factor done (aal2): what the admin acts as. */
export async function ownerDb(): Promise<SupabaseClient> {
  const db = await dbAs("OWNER");
  const { data } = await db.auth.mfa.listFactors();
  const factorId = data!.totp.find((f) => f.status === "verified")!.id;
  let { error } = await db.auth.mfa.challengeAndVerify({ factorId, code: totp(savedSecret()) });
  if (error) {
    await nextWindow();
    ({ error } = await db.auth.mfa.challengeAndVerify({ factorId, code: totp(savedSecret()) }));
  }
  if (error) throw error;
  return db;
}

/** Types the current code; if it was just used (or the window rolled over), waits and retries. */
export async function enterCode(page: Page, secret: string) {
  for (let attempt = 0; attempt < 2; attempt++) {
    await page.getByLabel("Six-digit code").fill(totp(secret));
    await page.getByRole("button", { name: /Continue|Turn on two-factor/ }).click();
    const done = await page
      .waitForURL(/\/admin$/, { timeout: 8_000 })
      .then(() => true)
      .catch(() => false);
    if (done) return;
    await nextWindow();
  }
  await expect(page).toHaveURL(/\/admin$/);
}

export async function signInWithPassword(page: Page, who: "OWNER" | "EDITOR" | "STRANGER") {
  // Wait for the form to be interactive, or a quick fill + click can land before hydration.
  await page.goto("/admin/login", { waitUntil: "networkidle" });
  await page.getByLabel("Email").fill(env[`E2E_${who}_EMAIL`]);
  await page.getByLabel("Password").fill(env[`E2E_${who}_PASSWORD`]);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((u) => u.pathname !== "/admin/login", { timeout: 20_000 });
}

/** Polls a public page (no admin cookies, so no preview) until `check` passes. */
export async function onSite(
  baseURL: string,
  path: string,
  check: (html: string, status: number) => boolean,
  what: string,
  ms = 45_000,
) {
  const end = Date.now() + ms;
  let last = "";
  while (Date.now() < end) {
    const res = await fetch(new URL(path, baseURL), { cache: "no-store" });
    const html = await res.text();
    if (check(html, res.status)) return html;
    last = `${res.status}`;
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`${what}: not seen on ${path} within ${ms / 1000}s (last status ${last})`);
}

/** HTML-escaped text as React renders it. */
export const html = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
