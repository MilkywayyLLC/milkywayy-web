"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { downloadUrl, presign, r2Ready } from "@/lib/r2";
import { requireAccount } from "./auth";
import { originFrom } from "./invite";
import { alertMilkywayy } from "./notify";

/**
 * Inquiries (owner, 10 Oct 2026): a client thread with Milkywayy, optionally tagged with one of
 * their shoots, with an optional attachment (straight to R2 under inquiries/<account>/…).
 * Milkywayy is emailed on a new inquiry and on every client reply.
 */
export type InquiryResult = {
  ok: boolean;
  error?: string;
  id?: string;
  url?: string;
  key?: string;
};
export type Attachment = { key: string; name: string; bytes: number; type: string };

const MAX = 25 * 1024 * 1024;

const why = (m: string) =>
  /add a subject/.test(m)
    ? "Add a subject."
    : /write your message/.test(m)
      ? "Write your message."
      : /shoot isn't yours/.test(m)
        ? "That shoot isn’t on your account."
        : /not your inquiry/.test(m)
          ? "You don’t have access to that inquiry."
          : /too many/.test(m)
            ? "That’s a lot at once. WhatsApp us and we’ll sort it out."
            : "Couldn’t send it. Try again.";

export async function startAttachment(name: string, bytes: number): Promise<InquiryResult> {
  const { current } = await requireAccount("/portal/inquiries");
  if (!r2Ready())
    return { ok: false, error: "Attachments aren’t set up here. Paste a link instead." };
  if (!(bytes > 0) || bytes > MAX) return { ok: false, error: "Attachments can be up to 25 MB." };
  const safe = name.replace(/[^\w.() -]/g, "_").slice(-120) || "file";
  const key = `inquiries/${current.account.id}/${crypto.randomUUID()}/${safe}`;
  return { ok: true, key, url: presign("PUT", key, 3600) };
}

async function alert(subject: string, lines: string[], id: string) {
  await alertMilkywayy(
    subject,
    lines,
    `${originFrom(await headers())}/admin/inquiries/${id}`,
  ).catch((e) => console.error("[portal] inquiry alert:", e));
}

export async function createInquiry(i: {
  subject: string;
  body: string;
  project?: string | null;
  attachment?: Attachment | null;
}): Promise<InquiryResult> {
  const { db, current } = await requireAccount("/portal/inquiries");
  const { data, error } = await db.rpc("create_inquiry", {
    p_account: current.account.id,
    p_subject: i.subject,
    p_body: i.body,
    p_project: i.project || null,
    p_attachment: i.attachment ?? null,
  });
  if (error) return { ok: false, error: why(error.message) };
  const id = data as string;
  await alert(
    `New inquiry: ${current.account.name} · ${i.subject.trim()}`,
    [
      `${current.account.name} sent an inquiry: “${i.subject.trim()}”.`,
      i.body.trim().slice(0, 600),
    ],
    id,
  );
  revalidatePath("/portal/inquiries");
  return { ok: true, id };
}

export async function replyInquiry(
  id: string,
  body: string,
  attachment?: Attachment | null,
): Promise<InquiryResult> {
  const { db, current } = await requireAccount("/portal/inquiries");
  const { error } = await db.rpc("reply_inquiry", {
    p_inquiry: id,
    p_body: body,
    p_attachment: attachment ?? null,
  });
  if (error) return { ok: false, error: why(error.message) };
  const { data: q } = await db.from("inquiries").select("subject").eq("id", id).maybeSingle();
  await alert(
    `Reply on an inquiry: ${current.account.name} · ${q?.subject ?? ""}`,
    [
      `${current.account.name} replied on “${q?.subject ?? "an inquiry"}”.`,
      body.trim().slice(0, 600),
    ],
    id,
  );
  revalidatePath(`/portal/inquiries/${id}`);
  return { ok: true, id };
}

export async function setInquiryStatus(
  id: string,
  status: "open" | "resolved",
): Promise<InquiryResult> {
  const { db } = await requireAccount("/portal/inquiries");
  const { error } = await db.rpc("set_inquiry_status", { p_inquiry: id, p_status: status });
  if (error) return { ok: false, error: why(error.message) };
  revalidatePath(`/portal/inquiries/${id}`);
  return { ok: true };
}

/** A short-lived download link for an attachment the client can see. */
export async function attachmentLink(messageId: string): Promise<InquiryResult> {
  const { db } = await requireAccount("/portal/inquiries");
  const { data } = await db
    .from("inquiry_messages")
    .select("attachment_key, attachment_name")
    .eq("id", messageId)
    .maybeSingle();
  if (!data?.attachment_key) return { ok: false, error: "That file isn’t available." };
  if (!r2Ready()) return { ok: false, error: "Downloads aren’t set up here." };
  return { ok: true, url: downloadUrl(data.attachment_key, data.attachment_name ?? "attachment") };
}
