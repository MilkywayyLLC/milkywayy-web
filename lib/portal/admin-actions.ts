"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { isEmail } from "@/lib/leads/rules";
import { toE164 } from "@/lib/phone";
import { portalAdminAction } from "./admin";
import { inviteLinks, inviteText, originFrom } from "./invite";
import { sendPortalInvite } from "./notify";
import { INDUSTRIES, SERVICES } from "./options";

/** Admin actions on client accounts (Owner only; every one is logged in the portal database). */
export type AdminResult = {
  ok: boolean;
  error?: string;
  notice?: string;
  share?: { text: string; whatsapp?: string; email?: string };
};

const failed = (e: unknown): AdminResult => {
  console.error("[admin/accounts]", e);
  const m = e instanceof Error ? e.message : "";
  if (/not allowed/.test(m))
    return { ok: false, error: "The portal admin key isn’t set up (PORTAL_ADMIN_SECRET)." };
  if (/duplicate|unique/i.test(m)) return { ok: false, error: "That person is already invited." };
  if (/check constraint|violates/i.test(m))
    return { ok: false, error: "Something in that isn’t in the right format." };
  return {
    ok: false,
    error: m.startsWith("add the contact")
      ? "Add the contact’s email or WhatsApp number."
      : "Couldn’t save. Try again.",
  };
};

function contactOf(form: FormData) {
  const email =
    String(form.get("email") ?? "")
      .trim()
      .toLowerCase() || null;
  const rawPhone = String(form.get("phone") ?? "").trim();
  const phone = rawPhone ? toE164(rawPhone) : null;
  if (email && !isEmail(email)) return { error: "That email looks incomplete." };
  if (rawPhone && !phone)
    return {
      error: "That WhatsApp number doesn’t look right. Use +country code if it isn’t a UAE number.",
    };
  if (!email && !phone) return { error: "Add their email or WhatsApp number." };
  return { email, phone };
}

/**
 * "Your Milkywayy portal is ready" (owner, 4 Oct 2026): Milkywayy emails the invite itself, from
 * the portal's address, with a sign-in link. Returns whether it went out.
 */
async function emailInvite(accountId: string, inviteId: string) {
  const rpc = await portalAdminAction();
  const open = await rpc<
    {
      id: string;
      account_name: string;
      name: string | null;
      email: string | null;
      role: string;
    }[]
  >("portal_admin_open_invites", { p_account: accountId });
  const inv = open.find((i) => i.id === inviteId);
  if (!inv?.email) return null;
  const status = await sendPortalInvite(
    accountId,
    { email: inv.email, name: inv.name, role: inv.role, account_name: inv.account_name },
    originFrom(await headers()),
  );
  // Only an email Resend accepted counts as sent.
  if (status === "sent") await rpc("portal_admin_invite_sent", { p_invite: inviteId });
  return status;
}
const sentNote = (status: string | null) =>
  status === "sent"
    ? " “Your Milkywayy portal is ready” emailed."
    : status === "skipped"
      ? " (Email not sent here: no RESEND_API_KEY, or a test address.)"
      : status === "failed"
        ? " The email didn’t go out: use Resend invite."
        : "";

/** The invite message, sent from Milkywayy's own WhatsApp (the chat number) or email. */
async function share(
  accountName: string,
  name: string | null,
  email: string | null,
  phone: string | null,
) {
  const text = inviteText(accountName, name, !!phone, originFrom(await headers()));
  return {
    text,
    ...inviteLinks(text, `Your Milkywayy client portal: ${accountName}`, { phone, email }),
  };
}

const NewClient = z.object({
  type: z.enum(["individual", "company"]),
  name: z.string().trim().min(2, "Add the client’s name.").max(120),
  industry: z.enum(INDUSTRIES.map((i) => i[0]) as [string, ...string[]]).optional(),
  industry_other: z.string().trim().max(120).optional(),
  currency: z.enum(["AED", "USD"]),
  services: z.array(z.enum(SERVICES.map((s) => s[0]) as [string, ...string[]])),
  contact_name: z.string().trim().max(120).optional(),
});

export async function createClientAccount(
  _: AdminResult | undefined,
  form: FormData,
): Promise<AdminResult> {
  const opt = (k: string) => String(form.get(k) ?? "").trim() || undefined;
  const parsed = NewClient.safeParse({
    type: form.get("type"),
    name: opt("name") ?? "",
    industry: opt("industry"),
    industry_other: opt("industry_other"),
    currency: form.get("currency") ?? "AED",
    services: form.getAll("services").map(String),
    contact_name: opt("contact_name"),
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const v = parsed.data;
  if (v.type === "company" && !v.industry)
    return { ok: false, error: "Choose what the company does." };
  const c = contactOf(form);
  if ("error" in c) return { ok: false, error: c.error };
  let id: string;
  try {
    const rpc = await portalAdminAction();
    id = await rpc<string>("portal_admin_create_client", {
      p_type: v.type,
      p_name: v.name,
      p_industry: v.industry ?? null,
      p_industry_other: v.industry === "other" ? (v.industry_other ?? null) : null,
      p_currency: v.currency,
      p_services: v.services,
      p_contact_name: v.contact_name ?? (v.type === "individual" ? v.name : null),
      p_contact_email: c.email,
      p_contact_phone: c.phone,
    });
  } catch (e) {
    return failed(e);
  }
  let emailed = "";
  if (form.get("email_invite") === "on" && c.email) {
    try {
      const rpc = await portalAdminAction();
      const [owner] = await rpc<{ id: string }[]>("portal_admin_open_invites", { p_account: id });
      if (owner) emailed = (await emailInvite(id, owner.id)) ?? "";
    } catch (e) {
      console.error("[admin/accounts] invite email:", e);
      emailed = "failed";
    }
  }
  revalidatePath("/admin/accounts");
  redirect(`/admin/accounts/${id}?created=1${emailed ? `&emailed=${emailed}` : ""}`);
}

export async function updateClientAccount(
  id: string,
  patch: { currency?: string; notes?: string },
): Promise<AdminResult> {
  if (patch.currency && !["AED", "USD"].includes(patch.currency))
    return { ok: false, error: "AED or USD." };
  if (patch.notes !== undefined && patch.notes.length > 8000)
    return { ok: false, error: "Keep notes under 8,000 characters." };
  try {
    const rpc = await portalAdminAction();
    await rpc("portal_admin_update_client", {
      p_id: id,
      p_currency: patch.currency ?? null,
      p_notes: patch.notes ?? null,
    });
  } catch (e) {
    return failed(e);
  }
  revalidatePath(`/admin/accounts/${id}`);
  return { ok: true, notice: patch.notes !== undefined ? "Notes saved." : "Currency saved." };
}

export async function adminInvite(
  _: AdminResult | undefined,
  form: FormData,
): Promise<AdminResult> {
  const id = String(form.get("account_id") ?? "");
  const accountName = String(form.get("account_name") ?? "");
  const role = String(form.get("role") ?? "member");
  if (!["owner", "admin", "member"].includes(role)) return { ok: false, error: "Choose a role." };
  const name = String(form.get("name") ?? "").trim() || null;
  const c = contactOf(form);
  if ("error" in c) return { ok: false, error: c.error };
  let status: string | null = null;
  try {
    const rpc = await portalAdminAction();
    const invite = await rpc<string>("portal_admin_invite", {
      p_id: id,
      p_name: name,
      p_email: c.email,
      p_phone: c.phone,
      p_role: role,
    });
    if (form.get("email_invite") === "on" && c.email) status = await emailInvite(id, invite);
  } catch (e) {
    return failed(e);
  }
  revalidatePath(`/admin/accounts/${id}`);
  return {
    ok: true,
    notice: `Invited.${sentNote(status)}`,
    share: await share(accountName, name, c.email, c.phone),
  };
}

export async function adminCancelInvite(accountId: string, inviteId: string): Promise<AdminResult> {
  try {
    const rpc = await portalAdminAction();
    await rpc("portal_admin_cancel_invite", { p_invite: inviteId });
  } catch (e) {
    return failed(e);
  }
  revalidatePath(`/admin/accounts/${accountId}`);
  return { ok: true, notice: "Invite cancelled." };
}

/** Send "Your Milkywayy portal is ready" again to someone who hasn't joined yet. */
export async function resendInvite(accountId: string, inviteId: string): Promise<AdminResult> {
  try {
    const status = await emailInvite(accountId, inviteId);
    revalidatePath(`/admin/accounts/${accountId}`);
    if (status === null) return { ok: false, error: "That invite has no email address." };
    if (status === "failed") return { ok: false, error: "The email didn’t go out. Try again." };
    return {
      ok: true,
      notice:
        status === "sent"
          ? "Invite emailed again."
          : "Logged, but not sent here (no email set up).",
    };
  } catch (e) {
    return failed(e);
  }
}
