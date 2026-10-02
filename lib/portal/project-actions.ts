"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { downloadUrl, r2Ready } from "@/lib/r2";
import { requireAccount } from "./auth";
import { originFrom } from "./invite";
import { notifyMilkywayy } from "./notify";

/**
 * What a client can do on a project: download, ask for a revision, approve, write a message.
 * The database decides (RLS and the checked functions); the server only signs download links for
 * files the client can already read, and tells Milkywayy by email.
 */
export type ClientResult = { ok: boolean; error?: string; notice?: string; url?: string };

const why = (m: string) =>
  /not your project/.test(m)
    ? "You don’t have access to that project."
    : /no revision rounds left/.test(m)
      ? "Both included revision rounds are used. Write a message and we’ll sort it out."
      : /already under way/.test(m)
        ? "A revision is already under way."
        : /delivered projects|nothing to approve/.test(m)
          ? "That isn’t possible right now. Refresh the page."
          : /say what should change/.test(m)
            ? "Tell us what should change."
            : "Something went wrong. Try again.";

export async function fileLink(fileId: string): Promise<ClientResult> {
  const { db } = await requireAccount("/portal");
  const { data: f } = await db
    .from("project_files")
    .select("source, url, r2_key, label")
    .eq("id", fileId)
    .maybeSingle();
  if (!f) return { ok: false, error: "That file isn’t available any more." };
  if (f.source === "link") return { ok: true, url: f.url };
  if (!r2Ready())
    return { ok: false, error: "Downloads aren’t set up yet. WhatsApp us for the files." };
  return { ok: true, url: downloadUrl(f.r2_key, f.label) };
}

async function projectRef(db: Awaited<ReturnType<typeof requireAccount>>["db"], id: string) {
  const { data } = await db.from("projects").select("ref, title").eq("id", id).maybeSingle();
  return data as { ref: string; title: string } | null;
}

export async function askRevision(projectId: string, note: string): Promise<ClientResult> {
  const { db, user } = await requireAccount("/portal");
  const text = note.trim();
  if (!text) return { ok: false, error: "Tell us what should change." };
  if (text.length > 1000)
    return { ok: false, error: "Keep it under 1,000 characters (add more in a message)." };
  const { data, error } = await db.rpc("request_revision", { p_project: projectId, p_note: text });
  if (error) return { ok: false, error: why(error.message) };
  const p = await projectRef(db, projectId);
  if (p)
    await notifyMilkywayy(
      projectId,
      "revision_requested",
      `Revision requested: ${p.ref} (round ${data.round} of ${data.of})`,
      [`${user.email ?? "A client"} asked for a revision on ${p.title} (${p.ref}):`, `“${text}”`],
      `${originFrom(await headers())}/admin/projects/${projectId}`,
    );
  revalidatePath("/portal", "layout");
  return {
    ok: true,
    notice: `Revision ${data.round} of ${data.of} requested. We’ll let you know when it’s ready.`,
  };
}

export async function approve(projectId: string): Promise<ClientResult> {
  const { db } = await requireAccount("/portal");
  const { error } = await db.rpc("approve_project", { p_project: projectId });
  if (error) return { ok: false, error: why(error.message) };
  revalidatePath("/portal", "layout");
  return { ok: true, notice: "Approved. Thank you! Your files stay available to download." };
}

export async function writeMessage(projectId: string, body: string): Promise<ClientResult> {
  const { db, user } = await requireAccount("/portal");
  const text = body.trim();
  if (!text) return { ok: false, error: "Write a message first." };
  if (text.length > 4000) return { ok: false, error: "Keep it under 4,000 characters." };
  const { error } = await db.rpc("post_project_message", { p_project: projectId, p_body: text });
  if (error) return { ok: false, error: why(error.message) };
  const p = await projectRef(db, projectId);
  if (p)
    await notifyMilkywayy(
      projectId,
      "client_message",
      `New message on ${p.ref}`,
      [
        `${user.email ?? "A client"} wrote about ${p.title} (${p.ref}):`,
        `“${text.slice(0, 1500)}”`,
      ],
      `${originFrom(await headers())}/admin/projects/${projectId}`,
    );
  revalidatePath("/portal", "layout");
  return { ok: true, notice: "Sent." };
}
