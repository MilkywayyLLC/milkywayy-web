"use server";

import { revalidatePath } from "next/cache";
import { cookies, headers } from "next/headers";
import { z } from "zod";
import { isEmail } from "@/lib/leads/rules";
import { DEFAULT_COUNTRY, toE164 } from "@/lib/phone";
import { COUNTRIES } from "@/lib/phone/countries";
import { ACCOUNT_COOKIE, getPortal, requireAccount } from "./auth";
import { inviteLinks, inviteText, originFrom } from "./invite";
import { INDUSTRIES, NOTIFY_CATEGORIES, NOTIFY_EVENTS } from "./options";
import { isManager } from "./shell";

/**
 * Team, Contacts and Settings (CLIENT_PORTAL_GUIDE §5.6, §5.7). Every write runs as the signed-in
 * client under row-level security, so the database refuses anything their role doesn't allow;
 * the checks here only give clearer messages.
 */
export type Result = { ok: boolean; error?: string; notice?: string; invite?: InviteShare };
export type InviteShare = { name: string; text: string; whatsapp?: string; email?: string };

const done = (notice?: string): Result => {
  revalidatePath("/portal", "layout");
  return { ok: true, notice };
};
const fail = (error: string): Result => ({ ok: false, error });
const dbError = (e: { code?: string; message: string }, what: string): Result => {
  console.error(`[portal] ${what}:`, e.code, e.message);
  if (e.code === "23505") return fail("That’s already there.");
  if (e.code === "23514") return fail("Something in that isn’t in the right format.");
  if (e.code === "42501") return fail("Your role can’t do that.");
  return fail("We couldn’t save that. Try again in a minute.");
};

function readPhone(form: FormData, field = "phone") {
  const raw = String(form.get(field) ?? "").trim();
  if (!raw) return { phone: null as string | null };
  const country = COUNTRIES.find((c) => c.iso === form.get(`${field}_country`)) ?? DEFAULT_COUNTRY;
  const phone = toE164(raw, country);
  return phone ? { phone } : { phone: null, bad: true };
}

// ---------- account switcher ----------

export async function switchAccount(id: string) {
  const p = await getPortal();
  if (p.state !== "signed-in" || !p.memberships.some((m) => m.account.id === id)) return;
  (await cookies()).set(ACCOUNT_COOKIE, id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/portal",
    maxAge: 60 * 60 * 24 * 365,
  });
  revalidatePath("/portal", "layout");
}

// ---------- team ----------

export async function setVisibility(value: "own" | "all"): Promise<Result> {
  const { db, current } = await requireAccount("/portal/team");
  if (!isManager(current)) return fail("Only the owner and admins can change this.");
  if (value !== "own" && value !== "all") return fail("Choose one of the two options.");
  const { error } = await db
    .from("accounts")
    .update({ member_visibility: value })
    .eq("id", current.account.id);
  return error ? dbError(error, "visibility") : done("Saved.");
}

export async function inviteMember(_: Result | undefined, form: FormData): Promise<Result> {
  const { db, current } = await requireAccount("/portal/team");
  if (!isManager(current)) return fail("Only the owner and admins can invite people.");
  const name = String(form.get("name") ?? "")
    .trim()
    .slice(0, 120);
  const via = form.get("via") === "email" ? "email" : "whatsapp";
  const role = form.get("role") === "admin" ? "admin" : "member";
  if (name.length < 2) return fail("Add their name.");
  let email: string | null = null;
  let phone: string | null = null;
  if (via === "email") {
    email = String(form.get("email") ?? "")
      .trim()
      .toLowerCase();
    if (!isEmail(email)) return fail("That email looks incomplete.");
  } else {
    const p = readPhone(form);
    if (!p.phone) return fail("Add their WhatsApp number, with the right country code.");
    phone = p.phone;
  }
  const { error } = await db
    .from("account_invites")
    .insert({ account_id: current.account.id, name, email, phone_e164: phone, role });
  if (error)
    return error.code === "23505" ? fail("They’re already invited.") : dbError(error, "invite");
  const text = inviteText(current.account.name, name, !!phone, originFrom(await headers()));
  revalidatePath("/portal", "layout");
  return {
    ok: true,
    notice: `${name} is invited. They join as soon as they sign in with that ${phone ? "number" : "email"}.`,
    invite: {
      name,
      text,
      ...inviteLinks(text, `You’re invited to ${current.account.name} on Milkywayy`, {
        phone,
        email,
      }),
    },
  };
}

export async function cancelInvite(id: string): Promise<Result> {
  const { db } = await requireAccount("/portal/team");
  const { data, error } = await db.from("account_invites").delete().eq("id", id).select("id");
  if (error) return dbError(error, "cancel invite");
  return data?.length ? done("Invite cancelled.") : fail("That invite is gone already.");
}

export async function changeRole(userId: string, role: string): Promise<Result> {
  const { db, current } = await requireAccount("/portal/team");
  if (role !== "admin" && role !== "member") return fail("Choose Admin or Member.");
  const { data, error } = await db
    .from("account_members")
    .update({ role })
    .eq("account_id", current.account.id)
    .eq("user_id", userId)
    .select("user_id");
  if (error) return dbError(error, "role");
  return data?.length ? done("Role updated.") : fail("You can’t change that person’s role.");
}

export async function removeMember(userId: string): Promise<Result> {
  const { db, current, user } = await requireAccount("/portal/team");
  const { data, error } = await db
    .from("account_members")
    .delete()
    .eq("account_id", current.account.id)
    .eq("user_id", userId)
    .select("user_id");
  if (error) return dbError(error, "remove");
  if (!data?.length) return fail("You can’t remove that person.");
  if (userId === user.id) (await cookies()).delete(ACCOUNT_COOKIE);
  return done(userId === user.id ? "You left the account." : "Removed from the account.");
}

// ---------- contacts ----------

const Contact = z.object({
  name: z.string().trim().min(2, "Add a name.").max(120),
  role: z.string().trim().max(80).optional(),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .max(200)
    .optional()
    .refine((e) => !e || isEmail(e), "That email looks incomplete."),
  brn: z.string().trim().max(40).optional(),
  is_default: z.boolean(),
});

export async function saveContact(_: Result | undefined, form: FormData): Promise<Result> {
  const { db, current } = await requireAccount("/portal/contacts");
  const opt = (k: string) => String(form.get(k) ?? "").trim() || undefined;
  const parsed = Contact.safeParse({
    name: opt("name") ?? "",
    role: opt("role"),
    email: opt("email"),
    brn: opt("brn"),
    is_default: form.get("is_default") === "on",
  });
  if (!parsed.success) return fail(parsed.error.issues[0].message);
  const p = readPhone(form);
  if (p.bad) return fail("That WhatsApp number doesn’t look right. Check it and the country code.");
  const row = {
    name: parsed.data.name,
    role: parsed.data.role ?? null,
    email: parsed.data.email ?? null,
    brn: parsed.data.brn ?? null,
    whatsapp: p.phone,
    is_default: parsed.data.is_default,
  };
  const id = String(form.get("id") ?? "");
  const { data, error } = id
    ? await db.from("contacts").update(row).eq("id", id).select("id")
    : await db
        .from("contacts")
        .insert({ ...row, account_id: current.account.id })
        .select("id");
  if (error) return dbError(error, "contact");
  if (!data?.length) return fail("You can only edit contacts you added.");
  return done(id ? "Contact saved." : "Contact added.");
}

export async function deleteContact(id: string): Promise<Result> {
  const { db } = await requireAccount("/portal/contacts");
  const { data, error } = await db.from("contacts").delete().eq("id", id).select("id");
  if (error) return dbError(error, "delete contact");
  return data?.length ? done("Contact removed.") : fail("You can only remove contacts you added.");
}

export async function makeDefaultContact(id: string): Promise<Result> {
  const { db } = await requireAccount("/portal/contacts");
  const { data, error } = await db
    .from("contacts")
    .update({ is_default: true })
    .eq("id", id)
    .select("id");
  if (error) return dbError(error, "default contact");
  return data?.length
    ? done("Default contact updated.")
    : fail("You can only change contacts you added.");
}

// ---------- settings ----------

export async function saveProfile(_: Result | undefined, form: FormData): Promise<Result> {
  const { db, user } = await requireAccount("/portal/settings");
  const name = String(form.get("full_name") ?? "").trim();
  if (name.length < 2 || name.length > 120) return fail("Add your name.");
  // The profile row exists once someone has an account; create it if an invite skipped that.
  const { data, error } = await db
    .from("profiles")
    .update({ full_name: name })
    .eq("user_id", user.id)
    .select("user_id");
  if (error) return dbError(error, "profile");
  return data?.length
    ? done("Saved.")
    : fail("We couldn’t find your profile. Sign out and in again.");
}

export async function saveNotifications(_: Result | undefined, form: FormData): Promise<Result> {
  const { db, user } = await requireAccount("/portal/settings");
  const prefs = Object.fromEntries(
    NOTIFY_EVENTS.map(([key]) => [key, { email: form.get(`${key}.email`) === "on" }]),
  );
  const { data, error } = await db
    .from("profiles")
    .update({ notification_prefs: prefs })
    .eq("user_id", user.id)
    .select("user_id");
  if (error) return dbError(error, "notifications");
  return data?.length ? done("Email settings saved.") : fail("We couldn’t find your profile.");
}

/** Owner/Admins: extra people who get the account's emails, per category (max 5 each). */
export async function saveRecipients(_: Result | undefined, form: FormData): Promise<Result> {
  const { db, current } = await requireAccount("/portal/settings");
  if (!isManager(current)) return fail("Only the owner and admins can add recipients.");
  const cc: Record<string, string[]> = {};
  for (const [cat, label] of NOTIFY_CATEGORIES) {
    const list = String(form.get(cat) ?? "")
      .split(/[\s,;]+/)
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);
    const bad = list.find((e) => !isEmail(e));
    if (bad) return fail(`“${bad}” in ${label} isn’t a full email address.`);
    if (list.length > 5) return fail(`Up to 5 extra recipients for ${label}.`);
    if (list.length) cc[cat] = [...new Set(list)];
  }
  const { error } = await db.from("accounts").update({ notify_cc: cc }).eq("id", current.account.id);
  return error ? dbError(error, "recipients") : done("Extra recipients saved.");
}

const Company = z
  .object({
    name: z.string().trim().min(2, "Add the name.").max(120),
    industry: z.enum(INDUSTRIES.map((i) => i[0]) as [string, ...string[]]).optional(),
    industry_other: z.string().trim().max(120).optional(),
    volume_note: z.string().trim().max(500).optional(),
    trn: z
      .string()
      .transform((t) => t.replace(/\s/g, ""))
      .refine((t) => t === "" || /^\d{15}$/.test(t), "A UAE TRN has 15 digits.")
      .optional(),
    billing_address: z.string().trim().max(300).optional(),
  })
  .refine((v) => v.industry !== "other" || v.industry_other, {
    message: "Tell us what the company does.",
  });

export async function saveCompany(_: Result | undefined, form: FormData): Promise<Result> {
  const { db, current } = await requireAccount("/portal/settings");
  if (!isManager(current)) return fail("Only the owner and admins can change the company details.");
  const opt = (k: string) => String(form.get(k) ?? "").trim() || undefined;
  const parsed = Company.safeParse({
    name: opt("name") ?? "",
    industry: current.account.type === "company" ? opt("industry") : undefined,
    industry_other: opt("industry_other"),
    volume_note: opt("volume_note"),
    trn: opt("trn"),
    billing_address: opt("billing_address"),
  });
  if (!parsed.success) return fail(parsed.error.issues[0].message);
  const v = parsed.data;
  const { error } = await db
    .from("accounts")
    .update({
      name: v.name,
      ...(current.account.type === "company"
        ? {
            industry: v.industry ?? null,
            industry_other: v.industry === "other" ? (v.industry_other ?? null) : null,
            volume_note: v.volume_note ?? null,
          }
        : {}),
      trn: v.trn || null,
      billing_address: v.billing_address ?? null,
    })
    .eq("id", current.account.id);
  return error ? dbError(error, "company") : done("Company details saved.");
}
