"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { downloadUrl, r2Ready } from "@/lib/r2";
import { portalAdminAction } from "./admin";
import { originFrom } from "./invite";
import { notifyInquiryReply, type Recipient } from "./notify";

/**
 * Admin → Inquiries (owner, 10 Oct 2026): reply in the thread, optionally with a private link
 * (e.g. raw footage on Google Drive) shown to the client as "Open link ↗"; the client is emailed.
 */
export type AdminInquiryResult = { ok: boolean; error?: string; notice?: string; url?: string };

export async function replyAsMilkywayy(
  id: string,
  body: string,
  linkUrl: string,
  linkLabel: string,
): Promise<AdminInquiryResult> {
  if (!body.trim()) return { ok: false, error: "Write the reply." };
  if (linkUrl.trim() && !/^https:\/\/\S+$/.test(linkUrl.trim()))
    return { ok: false, error: "The link must start with https://" };
  try {
    const rpc = await portalAdminAction();
    const out = await rpc<{ subject: string; account: string; recipients: Recipient[] }>(
      "portal_admin_reply_inquiry",
      {
        p_id: id,
        p_body: body,
        p_link_url: linkUrl.trim() || null,
        p_link_label: linkLabel.trim() || null,
      },
    );
    const emailed = await notifyInquiryReply(
      out.account,
      out.subject,
      out.recipients,
      `${originFrom(await headers())}/portal/inquiries/${id}`,
    );
    revalidatePath(`/admin/inquiries/${id}`);
    revalidatePath("/admin/inquiries");
    return { ok: true, notice: `Sent${emailed ? `; emailed ${emailed}` : ""}.` };
  } catch (e) {
    console.error("[admin/inquiries]", e);
    return { ok: false, error: "Couldn’t send. Try again." };
  }
}

export async function setInquiryStatusAdmin(id: string, status: "open" | "resolved") {
  const rpc = await portalAdminAction();
  await rpc("portal_admin_set_inquiry_status", { p_id: id, p_status: status });
  revalidatePath(`/admin/inquiries/${id}`);
  revalidatePath("/admin/inquiries");
}

/** A short-lived link to a client's attachment (only keys under inquiries/). */
export async function adminAttachmentLink(key: string, name: string): Promise<AdminInquiryResult> {
  await portalAdminAction();
  if (!/^inquiries\/[0-9a-f-]{36}\//.test(key) || key.includes(".."))
    return { ok: false, error: "Not found." };
  if (!r2Ready()) return { ok: false, error: "File storage (R2) isn’t set up here." };
  return { ok: true, url: downloadUrl(key, name) };
}
