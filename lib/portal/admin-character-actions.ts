"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { completeMultipart, deleteObject, downloadUrl } from "@/lib/r2";
import { portalAdminAction } from "./admin";
import { originFrom } from "./invite";
import { renderEmail, sendEmail, type Recipient } from "./notify";
import { planResume, planUpload, type ServerPlan } from "./upload-plan";

/**
 * The admin's side of AI characters (Owner only, through the secret-gated portal_admin_* functions):
 * upload 3 variations a round and send them, pack files (face pack, voice sample, notes), approve
 * with a name (which logs the "AI character creation" billing item), download anything.
 */
export type CharAdminResult = { ok: boolean; error?: string; notice?: string; url?: string };

const fail = (e: unknown): CharAdminResult => {
  const m = e instanceof Error ? e.message : String(e);
  console.error("[admin] characters:", m);
  return { ok: false, error: m.replace(/^.*?: /, "").slice(0, 200) || "Something went wrong." };
};
const refresh = () => revalidatePath("/admin", "layout");
const folder = (id: string, kind: "variation" | "pack") =>
  `characters/${id}/${kind === "variation" ? "v" : "pack"}`;
const okKey = (key: string) => key.startsWith("characters/") && !key.includes("..");

export async function charUploadStart(
  id: string,
  kind: "variation" | "pack",
  name: string,
  size: number,
): Promise<ServerPlan> {
  await portalAdminAction();
  try {
    return await planUpload(folder(id, kind), name, size);
  } catch (e) {
    return { ok: false, error: fail(e).error! };
  }
}

export async function charUploadResume(
  key: string,
  uploadId: string,
  size: number,
): Promise<ServerPlan> {
  await portalAdminAction();
  if (!okKey(key)) return { ok: false, error: "Start the upload again." };
  try {
    return await planResume(key, uploadId, size);
  } catch {
    return { ok: false, error: "Start the upload again." };
  }
}

export async function charUploadFinish(
  id: string,
  kind: "variation" | "pack",
  file: {
    key: string;
    uploadId?: string;
    parts?: { partNumber: number; etag: string }[];
    name: string;
    size: number;
    type: string;
  },
): Promise<CharAdminResult> {
  try {
    const rpc = await portalAdminAction();
    if (!file.key.startsWith(`${folder(id, kind)}/`)) return { ok: false, error: "Bad file." };
    if (file.uploadId && file.parts) await completeMultipart(file.key, file.uploadId, file.parts);
    await rpc("portal_admin_ai_character_add_file", {
      p_character: id,
      p_kind: kind,
      p_label: file.name.slice(0, 160),
      p_r2_key: file.key,
      p_url: null,
      p_bytes: file.size,
      p_content_type: file.type.slice(0, 120) || null,
    });
    refresh();
    return { ok: true, notice: `${file.name} uploaded.` };
  } catch (e) {
    return fail(e);
  }
}

export async function charAddLink(
  id: string,
  label: string,
  url: string,
): Promise<CharAdminResult> {
  if (!/^https:\/\/\S+$/.test(url.trim()))
    return { ok: false, error: "Paste a full https:// link." };
  try {
    const rpc = await portalAdminAction();
    await rpc("portal_admin_ai_character_add_file", {
      p_character: id,
      p_kind: "pack",
      p_label: label.trim() || "Link",
      p_r2_key: null,
      p_url: url.trim(),
      p_bytes: null,
      p_content_type: null,
    });
    refresh();
    return { ok: true, notice: "Link added." };
  } catch (e) {
    return fail(e);
  }
}

export async function charRemoveFile(fileId: string): Promise<CharAdminResult> {
  try {
    const rpc = await portalAdminAction();
    const key = await rpc<string | null>("portal_admin_ai_character_remove_file", {
      p_file: fileId,
    });
    if (key) await deleteObject(key).catch(() => undefined);
    refresh();
    return { ok: true, notice: "Removed." };
  } catch (e) {
    return fail(e);
  }
}

/** Send this round's 3 variations: the client's avatar members get "Variations ready". */
export async function charPublish(id: string): Promise<CharAdminResult> {
  try {
    const rpc = await portalAdminAction();
    const out = await rpc<{ round: number; recipients: Recipient[] }>(
      "portal_admin_ai_character_publish",
      { p_character: id },
    );
    const link = `${originFrom(await headers())}/portal/avatars`;
    let sent = 0;
    for (const r of out.recipients ?? []) {
      const { text, html } = renderEmail(
        [
          `Hi${r.name ? ` ${r.name.split(" ")[0]}` : ""},`,
          out.round > 1
            ? `Round ${out.round} of your AI avatar is ready: three new variations from your notes.`
            : "Your AI avatar variations are ready: three to choose from.",
          "Pick the one you like, or ask for changes.",
        ],
        "Choose your AI avatar",
        link,
      );
      const res = await sendEmail(r.email, "Your AI avatar variations are ready", text, html);
      if (res.status === "sent") sent++;
      else console.warn(`[notify] character_variations to ${r.email}: ${res.status}`);
    }
    refresh();
    return { ok: true, notice: `Sent to the client (${sent} email${sent === 1 ? "" : "s"}).` };
  } catch (e) {
    return fail(e);
  }
}

export async function charApprove(
  id: string,
  name: string,
  fileId: string,
  price: number | null,
): Promise<CharAdminResult> {
  try {
    const rpc = await portalAdminAction();
    await rpc("portal_admin_ai_character_approve", {
      p_character: id,
      p_name: name,
      p_file: fileId,
      p_price: price,
    });
    refresh();
    return { ok: true, notice: "Approved. The billing item is logged for this month." };
  } catch (e) {
    return fail(e);
  }
}

export async function charRename(id: string, name: string): Promise<CharAdminResult> {
  try {
    const rpc = await portalAdminAction();
    await rpc("portal_admin_ai_character_rename", { p_character: id, p_name: name });
    refresh();
    return { ok: true, notice: "Renamed." };
  } catch (e) {
    return fail(e);
  }
}

export async function charFileLink(key: string, label: string): Promise<CharAdminResult> {
  await portalAdminAction();
  if (!okKey(key)) return { ok: false, error: "Bad file." };
  return { ok: true, url: downloadUrl(key, label) };
}
