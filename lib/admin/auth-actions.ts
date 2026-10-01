"use server";

import { redirect } from "next/navigation";
import { sessionDb } from "@/lib/supabase/server";
import { getAdmin } from "./auth";

/**
 * Sign-in: email + password, then (Owner) a six-digit code from an authenticator app. There is
 * no sign-up: accounts are created in Supabase by the Owner, and the admins table decides who
 * gets in.
 */
export type FormState = { error?: string } | undefined;

export async function signIn(_: FormState, form: FormData): Promise<FormState> {
  const db = await sessionDb();
  if (!db) return { error: "The database isn't configured." };
  const email = String(form.get("email") ?? "")
    .trim()
    .toLowerCase();
  const password = String(form.get("password") ?? "");
  if (!email || !password) return { error: "Enter your email and password." };
  const { error } = await db.auth.signInWithPassword({ email, password });
  if (error)
    return {
      error: /rate|too many/i.test(error.message)
        ? "Too many attempts. Wait a few minutes and try again."
        : "Wrong email or password.",
    };
  redirect("/admin");
}

export async function signOut() {
  const db = await sessionDb();
  await db?.auth.signOut();
  redirect("/admin/login");
}

export type Enrollment = { factorId: string; qr: string; secret: string } | { error: string };

/** Starts setting up an authenticator app (Owner, first sign-in). */
export async function startEnrollment(): Promise<Enrollment> {
  const a = await getAdmin();
  if (a.state !== "mfa-enroll") return { error: "Two-factor is already set up." };
  const db = (await sessionDb())!;
  // Clear half-finished attempts so a fresh QR code is shown each time.
  const { data: list } = await db.auth.mfa.listFactors();
  for (const f of list?.all ?? [])
    if (f.status === "unverified") await db.auth.mfa.unenroll({ factorId: f.id });
  const { data, error } = await db.auth.mfa.enroll({
    factorType: "totp",
    friendlyName: `Authenticator ${new Date().toISOString().slice(0, 10)}`,
    issuer: "Milkywayy admin",
  });
  if (error || !data) return { error: error?.message ?? "Couldn't start two-factor set-up." };
  return { factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret };
}

/** Checks a six-digit code: finishes set-up (factorId given) or signs in with an existing app. */
export async function verifyCode(_: FormState, form: FormData): Promise<FormState> {
  const db = await sessionDb();
  if (!db) return { error: "The database isn't configured." };
  const code = String(form.get("code") ?? "").replace(/\s/g, "");
  if (!/^\d{6}$/.test(code)) return { error: "Enter the six-digit code from your app." };
  let factorId = String(form.get("factorId") ?? "");
  if (!factorId) {
    const { data } = await db.auth.mfa.listFactors();
    factorId = data?.totp.find((f) => f.status === "verified")?.id ?? "";
  }
  if (!factorId) return { error: "No authenticator is set up for this account." };
  const { error } = await db.auth.mfa.challengeAndVerify({ factorId, code });
  if (error)
    return {
      error: /rate|too many/i.test(error.message)
        ? "Too many attempts. Wait a minute and try again."
        : "That code didn't work. Check the time on your phone and try the newest code.",
    };
  redirect("/admin");
}
