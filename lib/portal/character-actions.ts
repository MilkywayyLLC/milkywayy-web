"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { completeMultipart, downloadUrl } from "@/lib/r2";
import { can } from "./access";
import { requireAccount } from "./auth";
import type { CharacterBrief } from "./characters";
import { originFrom } from "./invite";
import { alertMilkywayy } from "./notify";
import { planResume, planUpload, type ServerPlan } from "./upload-plan";

/**
 * The client's side of AI characters: send a brief, add reference images, pick a variation or
 * ask for changes. The database decides (checked functions + RLS); Milkywayy hears by email.
 */
export type CharacterResult = { ok: boolean; error?: string; id?: string; url?: string };

const why = (m: string) =>
  /say what the brand/.test(m)
    ? "Tell us the brand and what it does."
    : /choose the purpose/.test(m)
      ? "Choose what the avatar is for."
      : /describe the look/.test(m)
        ? "Describe the look and personality."
        : /https:\/\/ link/.test(m)
          ? "Links must start with https://"
          : /say what should change/.test(m)
            ? "Tell us what should change."
            : /isn't waiting for you|round's variations/.test(m)
              ? "That’s already been answered. Refresh the page."
              : /too many/.test(m)
                ? "That’s a lot at once. WhatsApp us and we’ll sort it out."
                : /not your|access/.test(m)
                  ? "Your access doesn’t include avatars. Ask the account owner."
                  : "Something went wrong. Try again.";

const clip = (s: string | undefined, n: number) => (s ?? "").trim().slice(0, n);
const admin = (origin: string, accountId: string) =>
  `${origin}/admin/accounts/${accountId}/characters`;

export async function createCharacter(brief: CharacterBrief): Promise<CharacterResult> {
  const { db, user, current } = await requireAccount("/portal/avatars");
  if (!can(current, "avatars")) return { ok: false, error: why("access") };
  const b: CharacterBrief = {
    brand: clip(brief.brand, 1500),
    purpose: brief.purpose,
    purpose_other: clip(brief.purpose_other, 200) || undefined,
    look: clip(brief.look, 2000),
    setting: clip(brief.setting, 500) || undefined,
    voice: clip(brief.voice, 300) || undefined,
    language: clip(brief.language, 100) || undefined,
    links: (brief.links ?? [])
      .map((l) => l.trim())
      .filter(Boolean)
      .slice(0, 10),
    similar_note: clip(brief.similar_note, 1000) || undefined,
  };
  const { data, error } = await db.rpc("create_ai_character", {
    p_account: current.account.id,
    p_brief: b,
  });
  if (error) {
    console.error("[portal] create_ai_character:", error.message);
    return { ok: false, error: why(error.message) };
  }
  const origin = originFrom(await headers());
  await alertMilkywayy(
    `New AI character brief: ${current.account.name}`,
    [
      `${user.email ?? "A client"} (${current.account.name}) sent an AI character brief:`,
      [
        `Brand: ${b.brand}`,
        `Purpose: ${b.purpose === "other" ? `Other (${b.purpose_other ?? ""})` : b.purpose}`,
        `Look and personality: ${b.look}`,
        b.setting ? `Setting: ${b.setting}` : "",
        b.voice || b.language
          ? `Voice / language: ${[b.voice, b.language].filter(Boolean).join(" · ")}`
          : "",
        b.similar_note ? `Similar to, not the same as: ${b.similar_note}` : "",
        b.links?.length ? `${b.links.length} reference link(s)` : "",
      ]
        .filter(Boolean)
        .join("\n"),
    ],
    admin(origin, current.account.id),
  );
  revalidatePath("/portal/avatars");
  return { ok: true, id: data as string };
}

const refFolder = (id: string) => `characters/${id}/ref`;

/** A reference image straight to R2 (the character must be one the client can see). */
export async function startCharacterUpload(
  id: string,
  name: string,
  size: number,
): Promise<ServerPlan> {
  const { db } = await requireAccount("/portal/avatars");
  const { data } = await db.from("ai_characters").select("id").eq("id", id).maybeSingle();
  if (!data) return { ok: false, error: "You don’t have access to that character." };
  try {
    return await planUpload(refFolder(id), name, size);
  } catch (e) {
    console.error("[portal] character upload:", e);
    return { ok: false, error: "Couldn’t start the upload. Try again." };
  }
}

export async function resumeCharacterUpload(
  id: string,
  key: string,
  uploadId: string,
  size: number,
): Promise<ServerPlan> {
  await requireAccount("/portal/avatars");
  if (!key.startsWith(`${refFolder(id)}/`) || key.includes(".."))
    return { ok: false, error: "Start the upload again." };
  try {
    return await planResume(key, uploadId, size);
  } catch {
    return { ok: false, error: "Start the upload again." };
  }
}

export async function finishCharacterUpload(
  id: string,
  file: {
    key: string;
    uploadId?: string;
    parts?: { partNumber: number; etag: string }[];
    name: string;
    size: number;
    type: string;
  },
): Promise<CharacterResult> {
  const { db } = await requireAccount("/portal/avatars");
  if (!file.key.startsWith(`${refFolder(id)}/`) || file.key.includes(".."))
    return { ok: false, error: "You don’t have access to that character." };
  try {
    if (file.uploadId && file.parts) await completeMultipart(file.key, file.uploadId, file.parts);
  } catch {
    return { ok: false, error: "The upload didn’t finish. Choose the file again to resume." };
  }
  const { error } = await db.rpc("add_ai_character_reference", {
    p_character: id,
    p_label: file.name.slice(0, 160),
    p_r2_key: file.key,
    p_url: null,
    p_bytes: file.size,
    p_content_type: file.type.slice(0, 120) || null,
  });
  if (error) return { ok: false, error: why(error.message) };
  return { ok: true };
}

async function tellMilkywayy(
  id: string,
  subject: (who: string, name: string) => string,
  lines: string[],
) {
  const { db, user, current } = await requireAccount("/portal/avatars");
  const { data: c } = await db
    .from("ai_characters")
    .select("name, brief, round")
    .eq("id", id)
    .maybeSingle();
  const name = (c?.name as string) || `character for ${String(c?.brief?.brand ?? "").slice(0, 40)}`;
  const origin = originFrom(await headers());
  await alertMilkywayy(
    subject(current.account.name, name),
    [`${user.email ?? "A client"} (${current.account.name}), round ${c?.round ?? "?"}:`, ...lines],
    admin(origin, current.account.id),
  );
}

export async function pickCharacter(
  id: string,
  fileId: string,
  n: number,
): Promise<CharacterResult> {
  const { db } = await requireAccount("/portal/avatars");
  const { error } = await db.rpc("pick_ai_character", { p_character: id, p_file: fileId });
  if (error) return { ok: false, error: why(error.message) };
  await tellMilkywayy(id, (a, name) => `AI character picked: ${a} · ${name}`, [
    `They picked variation ${n}. Approve it with a name in the admin.`,
  ]);
  revalidatePath("/portal/avatars");
  return { ok: true };
}

export async function requestCharacterChanges(
  id: string,
  fileId: string | null,
  n: number | null,
  note: string,
): Promise<CharacterResult> {
  const { db } = await requireAccount("/portal/avatars");
  const { error } = await db.rpc("request_ai_character_changes", {
    p_character: id,
    p_file: fileId,
    p_note: note,
  });
  if (error) return { ok: false, error: why(error.message) };
  await tellMilkywayy(id, (a, name) => `AI character changes requested: ${a} · ${name}`, [
    n ? `About variation ${n}:` : "About this round:",
    `“${note.trim().slice(0, 1500)}”`,
  ]);
  revalidatePath("/portal/avatars");
  return { ok: true };
}

/** Download an approved (or any visible) character image: signs only what RLS lets them read. */
export async function characterFileLink(fileId: string): Promise<CharacterResult> {
  const { db } = await requireAccount("/portal/avatars");
  const { data: f } = await db
    .from("ai_character_files")
    .select("r2_key, url, label")
    .eq("id", fileId)
    .maybeSingle();
  if (!f) return { ok: false, error: "That file isn’t available." };
  if (f.url) return { ok: true, url: f.url as string };
  return { ok: true, url: downloadUrl(f.r2_key as string, f.label as string) };
}
