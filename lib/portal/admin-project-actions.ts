"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import {
  abortMultipart,
  completeMultipart,
  deleteObject,
  downloadUrl,
  listParts,
  maxUploadBytes,
  maxUploadGb,
  PART_SIZE,
  partUrl,
  presign,
  r2Ready,
  startMultipart,
} from "@/lib/r2";
import { DEFAULT_COUNTRY, toE164 } from "@/lib/phone";
import { COUNTRIES } from "@/lib/phone/countries";
import { portalAdminAction } from "./admin";
import { originFrom } from "./invite";
import { projectLink, type MessageEvent, type ProjectInfo } from "./messages";
import { notifyClients, type Recipient } from "./notify";
import type { Project } from "./projects";

/**
 * Admin → Projects (CLIENT_PORTAL_GUIDE §7.2): status changes, deliveries (upload to R2 or paste a
 * link), revisions, replies and notes. Owner only (two-factor); every change goes through the
 * logged portal_admin_* functions. Emails go out only when "Email the client" is ticked; the
 * WhatsApp is the owner's to send (the page offers the ready-written message).
 */
export type ActionResult = {
  ok: boolean;
  fileId?: string;
  error?: string;
  notice?: string;
  emailed?: number;
  event?: string | null;
};

const fail = (e: unknown): ActionResult => {
  const m = e instanceof Error ? e.message : String(e);
  console.error("[admin/projects]", m);
  if (/not allowed/.test(m))
    return { ok: false, error: "The portal admin key isn’t set up (PORTAL_ADMIN_SECRET)." };
  if (/add files to this delivery first/.test(m))
    return { ok: false, error: "Add at least one file to this delivery first." };
  if (/approves the script first/.test(m))
    return { ok: false, error: "The client approves the script first (post it under Script)." };
  if (/post the script first/.test(m))
    return { ok: false, error: "Post the script below; that moves it to Script ready." };
  if (/say what you are waiting for/.test(m))
    return { ok: false, error: "Say what you’re waiting for: the client sees it." };
  if (/already approved/.test(m)) return { ok: false, error: "The script is already approved." };
  if (/check constraint|violates/.test(m))
    return { ok: false, error: "That isn’t allowed for this project." };
  return {
    ok: false,
    error: m.startsWith("R2")
      ? "The file storage refused that. Try again."
      : "Couldn’t save. Try again.",
  };
};

async function projectFor(rpc: Awaited<ReturnType<typeof portalAdminAction>>, id: string) {
  const d = await rpc<{
    project: Project;
    lead: { name: string | null } | null;
    owner: { name: string | null } | null;
  }>("portal_admin_project", { p_id: id });
  return d;
}

async function sendFor(
  id: string,
  out: { event?: string | null; recipients?: Recipient[]; label?: string },
  notify: boolean,
  extra: { text?: string } = {},
) {
  if (!notify || !out.event || !out.recipients?.length) return 0;
  const rpc = await portalAdminAction();
  const d = await projectFor(rpc, id);
  const p = d.project;
  const info: ProjectInfo = {
    ref: p.ref,
    title: p.title,
    type: p.type,
    status: p.status,
    status_note: p.status_note,
    shoot_date: p.shoot_date,
    slot: p.slot,
    meta: p.meta,
  };
  return notifyClients(p.id, out.event as MessageEvent, info, out.recipients, {
    link: projectLink(originFrom(await headers()), p.ref),
    label: out.label,
    text: extra.text,
    actor: "admin",
  });
}

const done = (id: string, r: ActionResult): ActionResult => {
  revalidatePath(`/admin/projects/${id}`);
  revalidatePath("/admin/projects");
  return r;
};

export async function setStatus(
  id: string,
  status: string,
  o: { note?: string; date?: string; slot?: string; notify?: boolean } = {},
): Promise<ActionResult> {
  try {
    const rpc = await portalAdminAction();
    const out = await rpc<{ event: string | null; recipients: Recipient[] }>(
      "portal_admin_set_status",
      {
        p_id: id,
        p_status: status,
        p_note: o.note ?? null,
        p_date: o.date || null,
        p_slot: o.slot || null,
      },
    );
    const emailed = await sendFor(id, out, !!o.notify);
    return done(id, {
      ok: true,
      event: out.event,
      emailed,
      notice: emailed ? `Saved. Emailed ${emailed}.` : "Saved.",
    });
  } catch (e) {
    return fail(e);
  }
}

export async function revisionStep(
  id: string,
  state: "in_progress" | "grant_round",
): Promise<ActionResult> {
  try {
    const rpc = await portalAdminAction();
    await rpc("portal_admin_revision", { p_id: id, p_state: state });
    return done(id, {
      ok: true,
      notice: state === "grant_round" ? "One more round added." : "Marked in progress.",
    });
  } catch (e) {
    return fail(e);
  }
}

export async function addLinkFile(
  id: string,
  delivery: { no: number; label: string },
  file: { kind: string; label: string; url: string },
): Promise<ActionResult> {
  if (!/^https:\/\/\S+$/.test(file.url)) return { ok: false, error: "Paste a full https:// link." };
  if (!file.label.trim()) return { ok: false, error: "Give it a name the client will see." };
  try {
    const rpc = await portalAdminAction();
    await rpc("portal_admin_add_file", {
      p_id: id,
      p_delivery_no: delivery.no,
      p_delivery_label: delivery.label,
      p_kind: file.kind,
      p_source: "link",
      p_url: file.url,
      p_r2_key: null,
      p_label: file.label.trim(),
      p_bytes: null,
      p_content_type: null,
    });
    return done(id, { ok: true, notice: "Link added." });
  } catch (e) {
    return fail(e);
  }
}

// ---------- uploads to R2: the browser sends the bytes straight to R2 with presigned URLs ----------

export type UploadPlan =
  | { ok: false; error: string }
  | {
      ok: true;
      key: string;
      single?: string;
      uploadId?: string;
      parts?: { partNumber: number; url: string }[];
    };

export async function startUpload(
  id: string,
  ref: string,
  deliveryNo: number,
  name: string,
  size: number,
): Promise<UploadPlan> {
  await portalAdminAction(); // Owner only
  if (!r2Ready())
    return { ok: false, error: "File storage (R2) isn’t set up for this deployment." };
  if (size <= 0 || size > maxUploadBytes())
    return {
      ok: false,
      error: `Files can be up to ${maxUploadGb()} GB. Use a link for bigger ones.`,
    };
  const safe =
    name
      .replace(/[^\w.\- ()]+/g, "-")
      .replace(/\s+/g, " ")
      .trim()
      .slice(-120) || "file";
  const key = `projects/${ref}/d${deliveryNo}/${randomUUID().slice(0, 8)}-${safe}`;
  if (size <= PART_SIZE) return { ok: true, key, single: presign("PUT", key, 3600) };
  try {
    const uploadId = await startMultipart(key);
    const count = Math.ceil(size / PART_SIZE);
    const parts = Array.from({ length: count }, (_, i) => ({
      partNumber: i + 1,
      url: partUrl(key, uploadId, i + 1),
    }));
    return { ok: true, key, uploadId, parts };
  } catch (e) {
    const r = fail(e);
    return { ok: false, error: r.error! };
  }
}

/** After a reload or a dropped connection: which parts R2 already has, plus fresh URLs for the rest. */
export async function resumeUpload(
  key: string,
  uploadId: string,
  size: number,
): Promise<UploadPlan & { done?: { partNumber: number; etag: string }[] }> {
  await portalAdminAction();
  try {
    const have = await listParts(key, uploadId);
    const count = Math.ceil(size / PART_SIZE);
    const parts = Array.from({ length: count }, (_, i) => i + 1)
      .filter((n) => !have.some((h) => h.partNumber === n))
      .map((n) => ({ partNumber: n, url: partUrl(key, uploadId, n) }));
    return { ok: true, key, uploadId, parts, done: have };
  } catch (e) {
    const r = fail(e);
    return { ok: false, error: r.error! };
  }
}

export async function finishUpload(
  id: string,
  delivery: { no: number; label: string },
  file: {
    key: string;
    uploadId?: string;
    parts?: { partNumber: number; etag: string }[];
    name: string;
    size: number;
    type: string;
    kind: string;
  },
): Promise<ActionResult> {
  try {
    const rpc = await portalAdminAction();
    if (file.uploadId && file.parts) await completeMultipart(file.key, file.uploadId, file.parts);
    const fileId = await rpc<string>("portal_admin_add_file", {
      p_id: id,
      p_delivery_no: delivery.no,
      p_delivery_label: delivery.label,
      p_kind: file.kind,
      p_source: "r2",
      p_url: null,
      p_r2_key: file.key,
      p_label: file.name.slice(0, 160),
      p_bytes: file.size,
      p_content_type: file.type.slice(0, 120) || null,
    });
    return done(id, { ok: true, fileId, notice: `${file.name} uploaded.` });
  } catch (e) {
    return fail(e);
  }
}

export async function cancelUpload(key: string, uploadId: string) {
  await portalAdminAction();
  await abortMultipart(key, uploadId).catch(() => undefined);
}

export async function removeFile(id: string, fileId: string): Promise<ActionResult> {
  try {
    const rpc = await portalAdminAction();
    const key = await rpc<string | null>("portal_admin_remove_file", { p_file: fileId });
    if (key && r2Ready()) {
      await deleteObject(key).catch((e) => console.error("[admin/projects] R2 delete:", e));
      await deleteObject(`${key}.thumb.webp`).catch(() => undefined);
    }
    return done(id, { ok: true, notice: "Removed." });
  } catch (e) {
    return fail(e);
  }
}

export async function publishDelivery(
  id: string,
  deliveryNo: number,
  notify: boolean,
): Promise<ActionResult> {
  try {
    const rpc = await portalAdminAction();
    const out = await rpc<{ event: string | null; recipients: Recipient[]; label: string }>(
      "portal_admin_publish_delivery",
      {
        p_id: id,
        p_delivery_no: deliveryNo,
      },
    );
    const emailed = await sendFor(id, out, notify);
    return done(id, {
      ok: true,
      event: out.event,
      emailed,
      notice: `${out.label} published${emailed ? `, emailed ${emailed}` : ""}.`,
    });
  } catch (e) {
    return fail(e);
  }
}

export async function adminReply(id: string, body: string, notify: boolean): Promise<ActionResult> {
  const text = body.trim();
  if (!text) return { ok: false, error: "Write a message first." };
  if (text.length > 4000) return { ok: false, error: "Keep it under 4,000 characters." };
  try {
    const rpc = await portalAdminAction();
    const out = await rpc<{ event: string; recipients: Recipient[] }>("portal_admin_message", {
      p_id: id,
      p_body: text,
    });
    const emailed = await sendFor(id, out, notify, { text });
    return done(id, {
      ok: true,
      event: out.event,
      emailed,
      notice: emailed ? `Sent and emailed ${emailed}.` : "Sent.",
    });
  } catch (e) {
    return fail(e);
  }
}

export async function saveProjectNotes(id: string, notes: string): Promise<ActionResult> {
  if (notes.length > 8000) return { ok: false, error: "Keep notes under 8,000 characters." };
  try {
    const rpc = await portalAdminAction();
    await rpc("portal_admin_project_notes", { p_id: id, p_notes: notes });
    return done(id, { ok: true, notice: "Notes saved." });
  } catch (e) {
    return fail(e);
  }
}

/** The owner tapped "Send on WhatsApp": recorded in the notification log (sent by hand). */
export async function logWhatsApp(id: string, template: string, to: string) {
  try {
    const rpc = await portalAdminAction();
    await rpc("portal_admin_log_notification", {
      p_project: id,
      p_channel: "whatsapp",
      p_template: template,
      p_to: to,
      p_status: "opened",
    });
    revalidatePath(`/admin/projects/${id}`);
  } catch (e) {
    console.error("[admin/projects] WhatsApp log:", e);
  }
}

export async function setRetention(accountId: string, months: number): Promise<ActionResult> {
  if (![12, 18, 24, 36, 60].includes(months))
    return { ok: false, error: "Choose one of the options." };
  try {
    const rpc = await portalAdminAction();
    await rpc("portal_admin_set_retention", { p_id: accountId, p_months: months });
    revalidatePath(`/admin/accounts/${accountId}`);
    return { ok: true, notice: `Files now kept ${months} months after completion.` };
  } catch (e) {
    return fail(e);
  }
}

/** Post a script version for the client to approve (avatar videos). */
export async function postScript(
  id: string,
  body: string,
  length: string,
  notify: boolean,
): Promise<ActionResult> {
  const text = body.trim();
  if (!text) return { ok: false, error: "Write the script first." };
  if (text.length > 20000) return { ok: false, error: "Keep the script under 20,000 characters." };
  try {
    const rpc = await portalAdminAction();
    const out = await rpc<{ event: string; version: number; recipients: Recipient[] }>(
      "portal_admin_post_script",
      { p_id: id, p_body: text, p_length: length.trim().slice(0, 60) || null },
    );
    const emailed = await sendFor(id, out, notify);
    return done(id, {
      ok: true,
      event: out.event,
      emailed,
      notice: `Script v${out.version} posted${emailed ? `, emailed ${emailed}` : ""}.`,
    });
  } catch (e) {
    return fail(e);
  }
}

/** A short-lived link to any file on a project (e.g. the client's raw uploads). */
export async function adminFileLink(
  id: string,
  fileId: string,
): Promise<{ ok: boolean; url?: string; error?: string }> {
  try {
    const rpc = await portalAdminAction();
    const d = await projectFor(rpc, id);
    const f = (
      d as unknown as {
        files: {
          id: string;
          source: string;
          url: string | null;
          r2_key: string | null;
          label: string;
        }[];
      }
    ).files.find((x) => x.id === fileId);
    if (!f) return { ok: false, error: "That file isn’t there any more." };
    if (f.source === "link") return { ok: true, url: f.url! };
    if (!r2Ready()) return { ok: false, error: "File storage (R2) isn’t set up here." };
    return { ok: true, url: downloadUrl(f.r2_key!, f.label) };
  } catch (e) {
    return fail(e);
  }
}

// ---------- QA fixes: projects the admin creates, bookings the admin attaches ----------

export type NewClientProject = {
  account: string;
  type: "shoot" | "edit" | "avatar";
  title: string;
  kind?: string;
  quantity?: number | null;
  notes?: string;
  due?: string;
  shootDate?: string;
  slot?: string;
  area?: string;
  building?: string;
  unit?: string;
  services?: string[];
  price?: number | null;
  scriptBy?: "milkywayy" | "client";
};

/** A project for a client whose booking came by WhatsApp or phone. */
export async function createClientProject(
  p: NewClientProject,
): Promise<ActionResult & { id?: string; ref?: string }> {
  if (!p.account) return { ok: false, error: "Choose the client." };
  if (!p.title.trim()) return { ok: false, error: "Give it a title." };
  try {
    const rpc = await portalAdminAction();
    const out = await rpc<{ id: string; ref: string }>("portal_admin_create_project", {
      p_account: p.account,
      p_type: p.type,
      p_title: p.title.trim(),
      p_kind: p.type === "shoot" ? null : (p.kind ?? null),
      p_quantity: p.quantity || null,
      p_notes: p.notes?.trim() || null,
      p_due: p.due || null,
      p_shoot_date: p.type === "shoot" ? p.shootDate || null : null,
      p_slot: p.type === "shoot" ? p.slot || null : null,
      p_area: p.area?.trim() || null,
      p_building: p.building?.trim() || null,
      p_unit: p.unit?.trim() || null,
      p_services: p.type === "shoot" ? (p.services ?? []) : [],
      p_price: p.price ?? null,
      p_script_by: p.type === "avatar" ? (p.scriptBy ?? "milkywayy") : null,
    });
    revalidatePath("/admin/projects");
    revalidatePath(`/admin/accounts/${p.account}`);
    return { ok: true, id: out.id, ref: out.ref, notice: `${out.ref} created.` };
  } catch (e) {
    const m = e instanceof Error ? e.message : "";
    if (/building and area/.test(m)) return { ok: false, error: "Add the building and the area." };
    if (/choose what it is/.test(m)) return { ok: false, error: "Choose what it is." };
    return fail(e);
  }
}

/** Attach a website booking (by its ref) to a client: its projects join their portal. */
export async function attachBooking(
  ref: string,
  account: string,
): Promise<ActionResult & { ids?: string[] }> {
  const r = ref.trim().toUpperCase();
  if (!/^MW-\d{3,9}$/.test(r)) return { ok: false, error: "Enter the booking ref, e.g. MW-1314." };
  if (!account) return { ok: false, error: "Choose the client." };
  try {
    const rpc = await portalAdminAction();
    const out = await rpc<{ ref: string; projects: number; ids: string[] }>(
      "portal_admin_attach_lead",
      { p_ref: r, p_account: account },
    );
    revalidatePath("/admin/projects");
    revalidatePath(`/admin/accounts/${account}`);
    for (const id of out.ids) revalidatePath(`/admin/projects/${id}`);
    return {
      ok: true,
      ids: out.ids,
      notice: `${out.ref} attached (${out.projects} project${out.projects === 1 ? "" : "s"}).`,
    };
  } catch (e) {
    const m = e instanceof Error ? e.message : "";
    if (/no booking with that ref/.test(m))
      return { ok: false, error: `No booking ${r} in this database.` };
    if (/only property bookings/.test(m))
      return { ok: false, error: `${r} isn’t a property booking (only those become projects).` };
    return fail(e);
  }
}

/** The WhatsApp number we reach a client member on (contact only; never used to sign in). */
export async function setMemberPhone(
  account: string,
  user: string,
  raw: string,
  countryIso: string,
): Promise<ActionResult> {
  const country = COUNTRIES.find((c) => c.iso === countryIso) ?? DEFAULT_COUNTRY;
  const phone = raw.trim() ? toE164(raw, country) : null;
  if (raw.trim() && !phone) return { ok: false, error: "Check the number and the country code." };
  try {
    const rpc = await portalAdminAction();
    await rpc("portal_admin_set_member_phone", {
      p_account: account,
      p_user: user,
      p_phone: phone,
    });
    revalidatePath(`/admin/accounts/${account}`);
    return { ok: true, notice: phone ? "WhatsApp number saved." : "WhatsApp number removed." };
  } catch (e) {
    return fail(e);
  }
}

// ---------- photo previews (owner QA, 3 Oct 2026) ----------
// The admin's browser shrinks an uploaded photo to a small WebP and puts it next to the original
// (<key>.thumb.webp); clients see previews without downloading the full files.

export async function thumbUploadUrl(key: string): Promise<{ ok: boolean; url?: string }> {
  await portalAdminAction();
  if (!r2Ready() || !/^projects\/[^/]+\/d\d+\//.test(key) || key.includes(".."))
    return { ok: false };
  return { ok: true, url: presign("PUT", `${key}.thumb.webp`, 600) };
}

export async function saveThumb(id: string, fileId: string, key: string): Promise<ActionResult> {
  try {
    const rpc = await portalAdminAction();
    await rpc("portal_admin_set_thumb", { p_file: fileId, p_thumb_key: `${key}.thumb.webp` });
    revalidatePath(`/admin/projects/${id}`);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}
