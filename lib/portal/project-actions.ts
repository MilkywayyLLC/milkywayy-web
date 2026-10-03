"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { abortMultipart, completeMultipart, downloadUrl, r2Ready } from "@/lib/r2";
import { requireAccount } from "./auth";
import { originFrom } from "./invite";
import { projectLink } from "./messages";
import { notifyClients, notifyMilkywayy, type Recipient } from "./notify";
import { briefKindLabel, TYPE_LABEL, type ProjectType } from "./projects";
import { planResume, planUpload, type ServerPlan } from "./upload-plan";

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
            : /isn't waiting for you/.test(m)
              ? "That script has already been answered. Refresh the page."
              : /this project is completed/.test(m)
                ? "This project is completed. Ask in Messages if you need more."
                : /https:\/\/ link/.test(m)
                  ? "Paste a full link starting with https://"
                  : /too many/.test(m)
                    ? "That’s a lot at once. WhatsApp us and we’ll sort it out."
                    : /deadline is in the past/.test(m)
                      ? "Pick a deadline from today on."
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

// ---------- Phase 11: batches, avatar briefs, raw files, scripts ----------

export type NewProject = {
  type: "edit" | "avatar";
  title: string;
  kind: string;
  quantity?: number | null;
  notes?: string;
  references?: string[];
  due?: string | null;
  scriptBy?: "milkywayy" | "client";
  links?: { label: string; url: string }[];
};

/** Start a batch or avatar brief; emails the client's "received" and tells Milkywayy. */
export async function createProject(
  input: NewProject,
): Promise<ClientResult & { id?: string; ref?: string }> {
  const { db, user, current } = await requireAccount("/portal");
  const title = input.title.trim();
  if (!title) return { ok: false, error: "Give it a title." };
  const links = (input.links ?? []).filter((l) => l.url.trim());
  if (links.some((l) => !/^https:\/\/\S+$/.test(l.url.trim())))
    return { ok: false, error: "Paste full links starting with https://" };
  const { data, error } = await db.rpc("create_project", {
    p_account: current.account.id,
    p_type: input.type,
    p_title: title,
    p_kind: input.kind,
    p_quantity: input.quantity || null,
    p_notes: input.notes?.trim() || null,
    p_references: (input.references ?? []).map((r) => r.trim()).filter(Boolean),
    p_due: input.due || null,
    p_script_by: input.type === "avatar" ? (input.scriptBy ?? "milkywayy") : null,
  });
  if (error) {
    console.error("[portal] create_project:", error.message);
    return {
      ok: false,
      error: /choose what it is/.test(error.message) ? "Choose what it is." : why(error.message),
    };
  }
  const out = data as { id: string; ref: string; recipients: Recipient[] };
  for (const l of links)
    await db.rpc("add_project_file_in", {
      p_project: out.id,
      p_source: "link",
      p_label: l.label.trim() || "Raw files",
      p_url: l.url.trim(),
    });
  const origin = originFrom(await headers());
  await notifyClients(
    out.id,
    "batch_received",
    { ref: out.ref, title, type: input.type },
    out.recipients,
    { link: projectLink(origin, out.ref), actor: "client" },
  );
  await notifyMilkywayy(
    out.id,
    input.type === "avatar" ? "new_avatar_brief" : "new_batch",
    `New ${TYPE_LABEL[input.type].toLowerCase()}: ${title} (${out.ref})`,
    [
      `${user.email ?? "A client"} (${current.account.name}) started ${out.ref}:`,
      [
        title,
        briefKindLabel(input.type as ProjectType, input.kind),
        input.quantity ? `Quantity: ${input.quantity}` : "",
        input.due ? `Deadline wish: ${input.due}` : "",
        links.length ? `${links.length} link${links.length === 1 ? "" : "s"} to raw files` : "",
      ]
        .filter(Boolean)
        .join("\n"),
      input.notes?.trim() ? `Notes: “${input.notes.trim().slice(0, 1500)}”` : "",
    ].filter(Boolean),
    `${origin}/admin/projects/${out.id}`,
  );
  revalidatePath("/portal", "layout");
  return { ok: true, id: out.id, ref: out.ref, notice: "Received." };
}

/** The project the signed-in client can see (RLS), for uploads. */
async function visibleProject(db: Awaited<ReturnType<typeof requireAccount>>["db"], id: string) {
  const { data } = await db
    .from("projects")
    .select("id, ref, type, status, title")
    .eq("id", id)
    .maybeSingle();
  return data as { id: string; ref: string; type: string; status: string; title: string } | null;
}
const inFolder = (ref: string) => `projects/${ref}/in`;

export async function startClientUpload(
  projectId: string,
  name: string,
  size: number,
): Promise<ServerPlan> {
  const { db } = await requireAccount("/portal");
  const p = await visibleProject(db, projectId);
  if (!p || p.type === "shoot")
    return { ok: false, error: "You don’t have access to that project." };
  if (p.status === "completed") return { ok: false, error: "This project is completed." };
  try {
    return await planUpload(inFolder(p.ref), name, size);
  } catch (e) {
    console.error("[portal] upload start:", e);
    return { ok: false, error: "Couldn’t start the upload. Try again." };
  }
}

export async function resumeClientUpload(
  projectId: string,
  key: string,
  uploadId: string,
  size: number,
): Promise<ServerPlan> {
  const { db } = await requireAccount("/portal");
  const p = await visibleProject(db, projectId);
  if (!p || !key.startsWith(`${inFolder(p.ref)}/`) || key.includes(".."))
    return { ok: false, error: "Start the upload again." };
  try {
    return await planResume(key, uploadId, size);
  } catch {
    return { ok: false, error: "Start the upload again." };
  }
}

export async function finishClientUpload(
  projectId: string,
  file: {
    key: string;
    uploadId?: string;
    parts?: { partNumber: number; etag: string }[];
    name: string;
    size: number;
    type: string;
  },
): Promise<ClientResult> {
  const { db } = await requireAccount("/portal");
  const p = await visibleProject(db, projectId);
  if (!p || !file.key.startsWith(`${inFolder(p.ref)}/`) || file.key.includes(".."))
    return { ok: false, error: "You don’t have access to that project." };
  try {
    if (file.uploadId && file.parts) await completeMultipart(file.key, file.uploadId, file.parts);
  } catch (e) {
    console.error("[portal] upload complete:", e);
    return { ok: false, error: "The upload didn’t finish. Choose the file again to resume." };
  }
  const { error } = await db.rpc("add_project_file_in", {
    p_project: projectId,
    p_source: "r2",
    p_label: file.name.slice(0, 160),
    p_r2_key: file.key,
    p_bytes: file.size,
    p_content_type: file.type.slice(0, 120) || null,
  });
  if (error) return { ok: false, error: why(error.message) };
  revalidatePath("/portal", "layout");
  return { ok: true, notice: "Uploaded." };
}

export async function cancelClientUpload(projectId: string, key: string, uploadId: string) {
  const { db } = await requireAccount("/portal");
  const p = await visibleProject(db, projectId);
  if (p && key.startsWith(`${inFolder(p.ref)}/`))
    await abortMultipart(key, uploadId).catch(() => undefined);
}

/** Add raw files as a link (Drive, Dropbox, WeTransfer…). */
export async function addFileLink(
  projectId: string,
  label: string,
  url: string,
): Promise<ClientResult> {
  const { db } = await requireAccount("/portal");
  if (!/^https:\/\/\S+$/.test(url.trim()))
    return { ok: false, error: "Paste a full link starting with https://" };
  const { error } = await db.rpc("add_project_file_in", {
    p_project: projectId,
    p_source: "link",
    p_label: label.trim() || "More files",
    p_url: url.trim(),
  });
  if (error) return { ok: false, error: why(error.message) };
  revalidatePath("/portal", "layout");
  return { ok: true, notice: "Added. We’ll pick it up." };
}

/** Approve the latest script (production starts) or ask for changes. Milkywayy is told either way. */
export async function decideScript(
  projectId: string,
  scriptId: string,
  approveIt: boolean,
  comment = "",
): Promise<ClientResult> {
  const { db, user } = await requireAccount("/portal");
  const text = comment.trim();
  if (!approveIt && !text) return { ok: false, error: "Tell us what should change." };
  if (text.length > 2000) return { ok: false, error: "Keep it under 2,000 characters." };
  const { data, error } = await db.rpc("decide_script", {
    p_script: scriptId,
    p_approve: approveIt,
    p_comment: text || null,
  });
  if (error) return { ok: false, error: why(error.message) };
  const d = data as { version: number; ref: string; title: string };
  await notifyMilkywayy(
    projectId,
    approveIt ? "script_approved" : "script_changes",
    approveIt
      ? `Script approved: ${d.ref}, production can start`
      : `Script changes requested: ${d.ref} (v${d.version})`,
    approveIt
      ? [
          `${user.email ?? "The client"} approved script v${d.version} for ${d.title} (${d.ref}). It’s now In production.`,
        ]
      : [
          `${user.email ?? "The client"} asked for changes to script v${d.version} for ${d.title} (${d.ref}):`,
          `“${text}”`,
        ],
    `${originFrom(await headers())}/admin/projects/${projectId}`,
  );
  revalidatePath("/portal", "layout");
  return {
    ok: true,
    notice: approveIt
      ? "Script approved. Production has started."
      : "Changes sent. We’ll post the next version here.",
  };
}
