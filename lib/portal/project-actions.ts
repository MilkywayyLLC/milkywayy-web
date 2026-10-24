"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { abortMultipart, completeMultipart, downloadUrl, r2Ready } from "@/lib/r2";
import { AREA_OF, can } from "./access";
import { requireAccount } from "./auth";
import { portalAdminAs } from "./admin";
import {
  AVATAR_FORMATS,
  avatarEstimate,
  avatarKind,
  avatarLength,
  type AvatarFormat,
  type Rates,
} from "./booking";
import { afterBooking } from "./payment-server";
import { BOOKING_TERMS_VERSION } from "./payments";
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
    .select("project_id, source, url, r2_key, label, direction")
    .eq("id", fileId)
    .maybeSingle();
  if (!f) return { ok: false, error: "That file isn’t available any more." };
  // Deliveries stay locked until the booking is paid in full (payment terms, 24 Oct 2026).
  if (f.direction === "out") {
    const { data: pay } = await db.rpc("my_project_payment", { p_project: f.project_id });
    if ((pay as { locked?: boolean } | null)?.locked)
      return { ok: false, error: "Downloads unlock once the booking is paid in full." };
  }
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
  /** Editing "Other": what type of edit (required then). */
  kindOther?: string;
  /** Avatar videos: the format and length (owner, 10 Oct 2026). */
  avatar?: { format: AvatarFormat; length: number };
  quantity?: number | null;
  notes?: string;
  references?: string[];
  scriptBy?: "milkywayy" | "client";
  links?: { label: string; url: string }[];
  /** Avatar videos: the approved character(s) presenting it (17 Oct 2026). */
  characters?: string[];
  /** "I agree to the Booking Terms" (required, 24 Oct 2026). */
  termsAccepted?: boolean;
};

/** Edit types → their rate card key (per item). */
const EDIT_RATE: Record<string, string> = {
  short_form: "reel",
  long_form: "long_form",
  hdr_photos: "photo",
};

/** Start a batch or avatar brief; emails the client's "received" and tells Milkywayy. */
export async function createProject(input: NewProject): Promise<
  ClientResult & {
    id?: string;
    ref?: string;
    payUrl?: string | null;
    invoice?: { number: string | null; amount: number; currency: string } | null;
  }
> {
  const { db, user, current } = await requireAccount("/portal");
  if (!can(current, AREA_OF[input.type]))
    return { ok: false, error: "Your access doesn’t include this. Ask the account owner." };
  if (!input.termsAccepted)
    return { ok: false, error: "Tick “I agree to the Booking Terms” first." };
  const a0 = input.type === "avatar" ? input.avatar : undefined;
  // Short form is up to 30 seconds (the price list's unit); long form is whole minutes.
  const av = a0 && {
    format: a0.format,
    length: a0.format === "short" ? 30 : Math.min(60, Math.max(1, Math.round(a0.length))),
  };
  if (input.type === "avatar" && (!av || !(av.format in AVATAR_FORMATS)))
    return { ok: false, error: "Choose the format." };
  const chars = input.type === "avatar" ? [...new Set(input.characters ?? [])].slice(0, 4) : [];
  let charNames: string[] = [];
  if (input.type === "avatar") {
    const { data: ok } = chars.length
      ? await db
          .from("ai_characters")
          .select("id, name")
          .in("id", chars)
          .eq("account_id", current.account.id)
          .eq("status", "approved")
      : { data: [] };
    if (!chars.length || (ok ?? []).length !== chars.length)
      return { ok: false, error: "Choose your AI avatar (an approved character)." };
    charNames = (ok ?? []).map((c) => c.name as string);
  }
  const avLabel = av
    ? `${av.format === "short" ? "Short form" : "Long form"} · ${avatarLength(av.format, av.length)}`
    : "";
  // Avatar titles are optional: "Short form · 60s" when left empty.
  const title = input.title.trim() || avLabel;
  if (!title) return { ok: false, error: "Give it a title." };
  if (input.type === "edit" && input.kind === "other" && !input.kindOther?.trim())
    return { ok: false, error: "Say what type of edit." };
  const kind = av ? avatarKind(av.format, av.length) : input.kind;
  const notes = [
    av ? `Format: ${AVATAR_FORMATS[av.format].label} · ${avatarLength(av.format, av.length)}` : "",
    input.type === "edit" && input.kind === "other"
      ? `Type of edit: ${input.kindOther!.trim()}`
      : "",
    input.notes?.trim() ?? "",
  ]
    .filter(Boolean)
    .join("\n");
  const links = (input.links ?? []).filter((l) => l.url.trim());
  if (links.some((l) => !/^https:\/\/\S+$/.test(l.url.trim())))
    return { ok: false, error: "Paste full links starting with https://" };
  const { data, error } = await db.rpc("create_project", {
    p_account: current.account.id,
    p_type: input.type,
    p_title: title,
    p_kind: kind,
    p_quantity: input.quantity || null,
    p_notes: notes || null,
    p_references: (input.references ?? []).map((r) => r.trim()).filter(Boolean),
    p_due: null,
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
  if (chars.length) {
    const { error: e } = await db.rpc("set_project_characters", {
      p_project: out.id,
      p_characters: chars,
    });
    if (e) console.error("[portal] set_project_characters:", e.message);
  }
  for (const l of links)
    await db.rpc("add_project_file_in", {
      p_project: out.id,
      p_source: "link",
      p_label: l.label.trim() || "Raw files",
      p_url: l.url.trim(),
    });
  const { error: te } = await db.rpc("accept_booking_terms", {
    p_project: out.id,
    p_version: BOOKING_TERMS_VERSION,
  });
  if (te) console.error("[portal] accept_booking_terms:", te.message);
  const origin = originFrom(await headers());
  // What's due now by the client's term: the estimate from their own rates (price access only).
  const { data: opts } = await db.rpc("my_booking_options", { p_account: current.account.id });
  const rates = (opts as { rates: Rates | null } | null)?.rates ?? null;
  const editRate = input.type === "edit" ? rates?.[EDIT_RATE[input.kind] ?? ""] : null;
  const est =
    input.type === "avatar" && av
      ? avatarEstimate(av.format, av.length, rates)
      : editRate != null && input.quantity
        ? Math.round(Number(editRate) * input.quantity * 100) / 100
        : null;
  const pay = est
    ? await afterBooking({
        rpc: portalAdminAs(`client:${user.email ?? user.id}`),
        projectId: out.id,
        ref: out.ref,
        type: input.type,
        lines: [
          {
            description: `${title} · ${avLabel || briefKindLabel(input.type as ProjectType, kind)}`,
            qty: input.type === "edit" ? input.quantity || 1 : 1,
            unit_price: input.type === "edit" ? Number(editRate) : est,
          },
        ],
        estimate: est,
        email: user.email,
        origin,
        actor: `client:${user.email ?? user.id}`,
      })
    : { invoice: null, payUrl: null };
  await notifyClients(
    out.id,
    input.type === "avatar" ? "avatar_received" : "batch_received",
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
        avLabel || briefKindLabel(input.type as ProjectType, kind),
        input.type === "edit" && input.kind === "other" ? `Type: ${input.kindOther!.trim()}` : "",
        charNames.length
          ? `Presenter${charNames.length > 1 ? "s" : ""}: ${charNames.join(", ")}`
          : "",
        input.quantity ? `Quantity: ${input.quantity}` : "",
        links.length ? `${links.length} link${links.length === 1 ? "" : "s"} to raw files` : "",
      ]
        .filter(Boolean)
        .join("\n"),
      input.notes?.trim() ? `Notes: “${input.notes.trim().slice(0, 1500)}”` : "",
    ].filter(Boolean),
    `${origin}/admin/projects/${out.id}`,
  );
  // Sent: its draft goes.
  await db
    .from("portal_drafts")
    .delete()
    .eq("account_id", current.account.id)
    .eq("user_id", user.id)
    .eq("kind", input.type);
  revalidatePath("/portal", "layout");
  return {
    ok: true,
    id: out.id,
    ref: out.ref,
    notice: "Received.",
    payUrl: pay.payUrl,
    invoice: pay.invoice
      ? { number: pay.invoice.number, amount: pay.invoice.amount, currency: pay.invoice.currency }
      : null,
  };
}

/**
 * Edit an avatar video's brief before work starts (owner, 17 Oct 2026): the same form, prefilled.
 * Logged as "Brief edited"; Milkywayy is emailed "[Client] edited their AI avatar request".
 */
export async function updateAvatarBrief(
  projectId: string,
  input: Omit<NewProject, "type" | "kind">,
): Promise<ClientResult & { ref?: string }> {
  const { db, user, current } = await requireAccount("/portal/avatars");
  if (!can(current, "avatars"))
    return { ok: false, error: "Your access doesn’t include this. Ask the account owner." };
  const a0 = input.avatar;
  if (!a0 || !(a0.format in AVATAR_FORMATS)) return { ok: false, error: "Choose the format." };
  const av = {
    format: a0.format,
    length: a0.format === "short" ? 30 : Math.min(60, Math.max(1, Math.round(a0.length))),
  };
  const chars = [...new Set(input.characters ?? [])].slice(0, 4);
  const avLabel = `${av.format === "short" ? "Short form" : "Long form"} · ${avatarLength(av.format, av.length)}`;
  const title = input.title.trim() || avLabel;
  const notes = [
    `Format: ${AVATAR_FORMATS[av.format].label} · ${avatarLength(av.format, av.length)}`,
    input.notes?.trim() ?? "",
  ]
    .filter(Boolean)
    .join("\n");
  const { error } = await db.rpc("edit_avatar_brief", {
    p_project: projectId,
    p_title: title,
    p_kind: avatarKind(av.format, av.length),
    p_notes: notes,
    p_references: (input.references ?? []).map((r) => r.trim()).filter(Boolean),
    p_script_by: input.scriptBy ?? "milkywayy",
  });
  if (error) {
    console.error("[portal] edit_avatar_brief:", error.message);
    return {
      ok: false,
      error: /work has started/.test(error.message)
        ? "We’ve started on it: ask for a revision instead. Refresh the page."
        : why(error.message),
    };
  }
  if (chars.length) {
    const { error: e } = await db.rpc("set_project_characters", {
      p_project: projectId,
      p_characters: chars,
    });
    if (e) console.error("[portal] set_project_characters:", e.message);
  }
  for (const l of (input.links ?? []).filter((x) => /^https:\/\/\S+$/.test(x.url.trim())))
    await db.rpc("add_project_file_in", {
      p_project: projectId,
      p_source: "link",
      p_label: l.label.trim() || "Assets",
      p_url: l.url.trim(),
    });
  const p = await projectRef(db, projectId);
  await notifyMilkywayy(
    projectId,
    "avatar_brief_edited",
    `${current.account.name} edited their AI avatar request`,
    [
      `${user.email ?? "A client"} (${current.account.name}) edited the brief of ${p?.ref ?? "an avatar video"} before you started:`,
      [
        title,
        avLabel,
        `Script: ${input.scriptBy === "client" ? "they send it" : "Milkywayy writes it"}`,
      ]
        .filter(Boolean)
        .join("\n"),
      input.notes?.trim() ? `Notes: “${input.notes.trim().slice(0, 1500)}”` : "",
    ].filter(Boolean),
    `${originFrom(await headers())}/admin/projects/${projectId}`,
  );
  revalidatePath("/portal", "layout");
  return { ok: true, ref: p?.ref, notice: "Brief updated." };
}

/**
 * "Request a revision" on an avatar video once work has started (owner, 17 Oct 2026): delivered
 * videos use the revision rounds; before delivery the request is logged and posted to Messages.
 * Optional images are uploaded after, as the project's files. Milkywayy is emailed.
 */
export async function requestAvatarRevision(
  projectId: string,
  note: string,
  images: number,
): Promise<ClientResult> {
  const { db, user, current } = await requireAccount("/portal/avatars");
  const text = note.trim();
  if (text.length < 3) return { ok: false, error: "Tell us what should change." };
  if (text.length > 1000)
    return { ok: false, error: "Keep it under 1,000 characters (add more in a message)." };
  const p0 = await visibleProject(db, projectId);
  if (!p0 || p0.type !== "avatar")
    return { ok: false, error: "You don’t have access to that project." };
  let round = "";
  if (p0.status === "delivered") {
    const { data, error } = await db.rpc("request_revision", {
      p_project: projectId,
      p_note: text,
    });
    if (error) return { ok: false, error: why(error.message) };
    round = ` (round ${data.round} of ${data.of})`;
  } else {
    const { error } = await db.rpc("request_avatar_revision", {
      p_project: projectId,
      p_note: text,
    });
    if (error)
      return {
        ok: false,
        error: /isn't possible/.test(error.message)
          ? "That isn’t possible right now. Refresh the page."
          : why(error.message),
      };
  }
  await notifyMilkywayy(
    projectId,
    "revision_requested",
    `${current.account.name} asked for a revision on their AI avatar request${round}`,
    [
      `${user.email ?? "A client"} asked for a revision on ${p0.title} (${p0.ref}):`,
      `“${text}”`,
      ...(images
        ? [`${images} image${images === 1 ? "" : "s"} attached (in the project’s files).`]
        : []),
    ],
    `${originFrom(await headers())}/admin/projects/${projectId}`,
  );
  revalidatePath("/portal", "layout");
  return { ok: true, notice: "Revision requested. We’ll let you know when it’s ready." };
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
    notice: approveIt ? "Script approved. Production has started." : "Changes sent.",
  };
}
