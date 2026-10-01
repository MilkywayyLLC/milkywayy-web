import { expect, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  closeSync,
  existsSync,
  openSync,
  readFileSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
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

const SESSION = "tests/.auth/owner-session.json";
const LOCK = "tests/.auth/owner-session.lock";

/** Supabase as the e2e Owner with two-factor done (aal2): what the admin acts as. */
async function freshOwner(): Promise<{ db: SupabaseClient; token: string; expiresAt: number }> {
  let last: unknown;
  // A code works once: if another sign-in just used it, wait for the next one (fresh sign-in,
  // since a failed check also ends the session).
  for (let attempt = 0; attempt < 4; attempt++) {
    if (attempt) await nextWindow();
    const db = await dbAs("OWNER");
    const { data } = await db.auth.mfa.listFactors();
    const factorId = data?.totp.find((f) => f.status === "verified")?.id;
    if (!factorId)
      throw new Error("The e2e Owner has no authenticator; run the admin setup first.");
    const { error } = await db.auth.mfa.challengeAndVerify({ factorId, code: totp(savedSecret()) });
    if (!error) {
      const { data: s } = await db.auth.getSession();
      return { db, token: s.session!.access_token, expiresAt: s.session!.expires_at! * 1000 };
    }
    last = error;
  }
  throw last;
}

const withToken = (token: string) =>
  createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

/**
 * The e2e Owner, shared by every test worker: the first one signs in (password + code) and saves
 * the session in tests/.auth/ (gitignored); the others reuse it, so parallel files never compete
 * for the same 30-second code.
 */
export async function ownerDb(): Promise<SupabaseClient> {
  for (let i = 0; i < 180; i++) {
    try {
      const s = JSON.parse(readFileSync(SESSION, "utf8")) as { token: string; expiresAt: number };
      if (s.expiresAt > Date.now() + 10 * 60_000) return withToken(s.token);
    } catch {}
    let fd: number;
    try {
      if (existsSync(LOCK) && Date.now() - statSync(LOCK).mtimeMs > 150_000) unlinkSync(LOCK);
      fd = openSync(LOCK, "wx");
    } catch {
      await new Promise((r) => setTimeout(r, 1000)); // another worker is signing in
      continue;
    }
    try {
      const { token, expiresAt } = await freshOwner();
      writeFileSync(SESSION, JSON.stringify({ token, expiresAt }));
      return withToken(token);
    } finally {
      closeSync(fd);
      unlinkSync(LOCK);
    }
  }
  throw new Error("Timed out waiting for the e2e Owner session.");
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
