"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { env } from "@/lib/env";
import { isEmail } from "@/lib/leads/rules";
import { ACCOUNT_COOKIE, getPortal, safeNext } from "./auth";
import { INDUSTRIES, SERVICES } from "./options";
import { portalDb } from "./supabase";
import { syncAfterSignIn } from "./sync";

/**
 * Portal sign-in (CLIENT_PORTAL_GUIDE §3.3, owner, 3 Oct 2026): a 6-digit code by email is the
 * main way in, and it creates the account the first time. A password is optional (set one in
 * Settings, then "Sign in with a password instead"). A correct code also verifies the email, so
 * earlier website bookings made with it attach (§3.5); a typo'd or borrowed address never sees
 * anyone's bookings. Phone sign-in is switched off (lib/portal/flags.ts).
 */
export type AuthState =
  | {
      error?: string;
      field?: "email" | "password";
      email?: string;
      notice?: string;
      confirm?: boolean;
      /** The code was sent: show the code step. */
      code?: boolean;
      sentAt?: number;
    }
  | undefined;

const PASSWORD_MIN = 8;

async function origin() {
  const h = await headers();
  const o = h.get("origin");
  if (o && /^https?:\/\/[^/]+$/.test(o)) return o;
  const host = h.get("x-forwarded-host") ?? h.get("host");
  return host ? `${h.get("x-forwarded-proto") ?? "https"}://${host}` : env.siteUrl;
}

const readEmail = (form: FormData) =>
  String(form.get("email") ?? "")
    .trim()
    .toLowerCase();

function authError(e: { code?: string; message: string; status?: number }): string {
  switch (e.code) {
    case "invalid_credentials":
      return "Wrong email or password. No password yet? Sign in with a code instead.";
    case "email_not_confirmed":
      return "Your email isn’t confirmed yet. Sign in with a code instead: we’ll email you one.";
    case "otp_disabled":
    case "signup_disabled":
      return "New sign-ups are paused right now. Email or WhatsApp us and we’ll set you up.";
    case "over_request_rate_limit":
    case "over_email_send_rate_limit":
      return "Too many attempts. Wait a few minutes and try again.";
    case "email_address_invalid":
      return "That email address can’t receive mail. Check it for a typo.";
    case "weak_password":
      return `Choose a stronger password: at least ${PASSWORD_MIN} characters, not a common one.`;
    case "same_password":
      return "That’s your current password. Choose a new one.";
  }
  if (/rate|too many/i.test(e.message))
    return "Too many attempts. Wait a few minutes and try again.";
  // The mailer (Resend) refused the address: usually a typo or a domain that takes no mail.
  if (/error sending .*email/i.test(e.message)) {
    console.error("[portal] mailer refused:", e.status, e.message);
    return "We couldn’t email that address. Check it for a typo, or try again in a minute.";
  }
  console.error("[portal] auth error:", e.status, e.code, e.message);
  return "Something went wrong on our side. Try again in a minute.";
}

export async function signIn(_: AuthState, form: FormData): Promise<AuthState> {
  const db = await portalDb();
  if (!db) return { error: "The portal isn’t configured." };
  const email = readEmail(form);
  const password = String(form.get("password") ?? "");
  if (!isEmail(email))
    return { error: "Enter the email you signed up with.", field: "email", email };
  if (!password) return { error: "Enter your password.", field: "password", email };
  const { error } = await db.auth.signInWithPassword({ email, password });
  if (error) {
    return { error: authError(error), email };
  }
  const claimed = await syncAfterSignIn(db);
  const next = safeNext(form.get("next"));
  redirect(claimed ? `${next}${next.includes("?") ? "&" : "?"}claimed=${claimed}` : next);
}

export async function sendEmailCode(prev: AuthState, form: FormData): Promise<AuthState> {
  const db = await portalDb();
  if (!db) return { error: "The portal isn’t configured." };
  const email = readEmail(form);
  if (!isEmail(email))
    return {
      error: "That email looks incomplete. Check for a typo (e.g. name@company.com).",
      field: "email",
      email,
    };
  const { error } = await db.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
  if (error) return { error: authError(error), email, code: prev?.code };
  return {
    email,
    code: true,
    sentAt: Date.now(),
    notice: prev?.code ? `New code sent to ${email}.` : undefined,
  };
}

export async function verifyEmailCode(_: AuthState, form: FormData): Promise<AuthState> {
  const db = await portalDb();
  const email = readEmail(form);
  const token = String(form.get("token") ?? "").replace(/\D/g, "");
  if (!db || !isEmail(email)) return { error: "Enter your email again." };
  if (token.length < 6 || token.length > 8)
    return { error: "Enter the code from the email.", email, code: true, field: "password" };
  const { error } = await db.auth.verifyOtp({ email, token, type: "email" });
  if (error) {
    if (/rate|too many/i.test(error.message)) return { error: authError(error), email, code: true };
    return {
      error: "That code isn’t right or has expired. Check it, or ask for a new one.",
      email,
      code: true,
      field: "password",
    };
  }
  const claimed = await syncAfterSignIn(db);
  const next = safeNext(form.get("next"));
  redirect(claimed ? `${next}${next.includes("?") ? "&" : "?"}claimed=${claimed}` : next);
}

/** Settings: add or change the optional password (signed in by code or password already). */
export async function setPassword(_: AuthState, form: FormData): Promise<AuthState> {
  const p = await getPortal();
  if (p.state !== "signed-in") return { error: "Sign in again, then set your password." };
  const password = String(form.get("password") ?? "");
  if (password.length < PASSWORD_MIN)
    return { error: `Use at least ${PASSWORD_MIN} characters.`, field: "password" };
  if (password.length > 72)
    return { error: "That password is too long (72 characters at most).", field: "password" };
  const { error } = await p.db.auth.updateUser({ password });
  if (error) return { error: authError(error), field: "password" };
  return { notice: "Password saved. You can sign in with it or with a code." };
}

export async function forgotPassword(_: AuthState, form: FormData): Promise<AuthState> {
  const db = await portalDb();
  const email = readEmail(form);
  if (!db || !isEmail(email))
    return { error: "Enter your email, then tap “Forgot password?” again.", field: "email", email };
  const { error } = await db.auth.resetPasswordForEmail(email, {
    redirectTo: `${await origin()}/portal/auth/callback?next=/portal/reset`,
  });
  if (error && /rate|too many/i.test(error.message)) return { error: authError(error), email };
  return {
    email,
    notice: `If ${email} has an account, a link to set a new password is on its way.`,
  };
}

export async function updatePassword(_: AuthState, form: FormData): Promise<AuthState> {
  const p = await getPortal();
  if (p.state !== "signed-in")
    return { error: "That link has expired. Ask for a new one from the sign-in page." };
  const password = String(form.get("password") ?? "");
  if (password.length < PASSWORD_MIN)
    return {
      error: `Use at least ${PASSWORD_MIN} characters for your password.`,
      field: "password",
    };
  const { error } = await p.db.auth.updateUser({ password });
  if (error) return { error: authError(error), field: "password" };
  redirect("/portal?password=updated");
}

export async function signOut() {
  const db = await portalDb();
  await db?.auth.signOut();
  (await cookies()).delete(ACCOUNT_COOKIE);
  redirect("/portal/login?signed-out=1");
}

// ---------- onboarding (§3.4) ----------

const Onboarding = z
  .object({
    type: z.enum(["individual", "company"], { message: "Choose individual or company." }),
    fullName: z.string().trim().min(2, "Add your name.").max(120),
    company: z.string().trim().max(120).optional(),
    industry: z.enum(INDUSTRIES.map((i) => i[0]) as [string, ...string[]]).optional(),
    industryOther: z.string().trim().max(120).optional(),
    volume: z.string().trim().max(500).optional(),
    services: z
      .array(z.enum(SERVICES.map((s) => s[0]) as [string, ...string[]]))
      .min(1, "Pick at least one."),
  })
  .superRefine((v, ctx) => {
    if (v.type !== "company") return;
    if (!v.company || v.company.length < 2)
      ctx.addIssue({ code: "custom", path: ["company"], message: "Add the company name." });
    if (!v.industry)
      ctx.addIssue({
        code: "custom",
        path: ["industry"],
        message: "Choose what the company does.",
      });
    if (v.industry === "other" && !v.industryOther)
      ctx.addIssue({
        code: "custom",
        path: ["industryOther"],
        message: "Tell us what the company does.",
      });
  });

export type OnboardingState = { errors?: Record<string, string>; error?: string } | undefined;

export async function createAccount(_: OnboardingState, form: FormData): Promise<OnboardingState> {
  const p = await getPortal();
  if (p.state !== "signed-in") redirect("/portal/login?next=/portal/welcome");
  if (p.memberships.length) redirect("/portal");
  const opt = (k: string) => {
    const v = String(form.get(k) ?? "").trim();
    return v || undefined;
  };
  const parsed = Onboarding.safeParse({
    type: opt("type"),
    fullName: opt("fullName") ?? "",
    company: opt("company"),
    industry: opt("industry"),
    industryOther: opt("industryOther"),
    volume: opt("volume"),
    services: form.getAll("services").map(String),
  });
  if (!parsed.success)
    return {
      errors: Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message])),
    };
  const v = parsed.data;
  const { data: id, error } = await p.db.rpc("create_my_account", {
    p_type: v.type,
    p_name: v.type === "company" ? v.company : v.fullName,
    p_full_name: v.fullName,
    p_industry: v.type === "company" ? v.industry : null,
    p_industry_other: v.industry === "other" ? v.industryOther : null,
    p_volume_note: v.type === "company" ? (v.volume ?? null) : null,
    p_services: v.services,
  });
  if (error) {
    if (error.code === "23505") redirect("/portal");
    console.error("[portal] create_my_account:", error.code, error.message);
    return { error: "We couldn’t save that. Try again, or WhatsApp us if it keeps happening." };
  }
  const { data: claim } = await p.db.rpc("claim_my_bookings", { p_account: id });
  (await cookies()).set(ACCOUNT_COOKIE, String(id), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/portal",
    maxAge: 60 * 60 * 24 * 365,
  });
  const n = ((claim?.claimed as string[] | undefined) ?? []).length;
  redirect(n ? `/portal?claimed=${n}` : "/portal?welcome=1");
}
