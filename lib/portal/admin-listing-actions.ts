"use server";

import { revalidatePath } from "next/cache";
import { deleteObject, getObject, presign, putObject, r2Ready } from "@/lib/r2";
import { portalAdminAction } from "./admin";

/**
 * Admin side of share pages (CLIENT_PORTAL_GUIDE §6.5, §7.4): web versions of delivered media
 * (made in the browser on upload, or here with sharp for older photos), a reel's web MP4 and
 * poster, and switching any share page off with a reason. Owner only, logged.
 */
export type MediaResult = {
  ok: boolean;
  error?: string;
  notice?: string;
  urls?: Record<string, string>;
  left?: number;
};

const fail = (e: unknown): MediaResult => {
  const m = e instanceof Error ? e.message : String(e);
  console.error("[admin/listings]", m);
  if (/not allowed/.test(m)) return { ok: false, error: "The portal admin key isn’t set up." };
  if (/over 40 MB/.test(m)) return { ok: false, error: "Keep the web version under 40 MB." };
  if (/give a reason/.test(m)) return { ok: false, error: "Give a reason (the client sees it)." };
  if (/wrong key|only photos and videos/.test(m))
    return { ok: false, error: "That file can’t have a web version." };
  return { ok: false, error: "Couldn’t save. Try again." };
};
const UUID = /^[0-9a-f-]{36}$/;
const base = (project: string, file: string) => `projects/${project}/web/${file}`;

/** Presigned PUTs for a file's web versions: photos → .webp + .og.jpg; videos → .mp4 + poster. */
export async function mediaUploadUrls(
  projectId: string,
  fileId: string,
  kind: "photo" | "video",
): Promise<MediaResult> {
  await portalAdminAction();
  if (!r2Ready()) return { ok: false, error: "File storage (R2) isn’t set up here." };
  if (!UUID.test(projectId) || !UUID.test(fileId)) return { ok: false, error: "Refresh the page." };
  const b = base(projectId, fileId);
  return {
    ok: true,
    urls:
      kind === "photo"
        ? { web: presign("PUT", `${b}.webp`, 900), og: presign("PUT", `${b}.og.jpg`, 900) }
        : {
            web: presign("PUT", `${b}.mp4`, 1800),
            poster: presign("PUT", `${b}.poster.jpg`, 900),
          },
  };
}

/** Record which web versions are now in R2 (null clears one); removes replaced files. */
export async function saveMedia(
  projectId: string,
  fileId: string,
  m: { web: boolean; og?: boolean; poster?: boolean; bytes?: number; video?: boolean },
): Promise<MediaResult> {
  try {
    const rpc = await portalAdminAction();
    const b = base(projectId, fileId);
    const old = await rpc<string[]>("portal_admin_set_media", {
      p_file: fileId,
      p_web: m.web ? `${b}.${m.video ? "mp4" : "webp"}` : null,
      p_og: !m.video && m.og ? `${b}.og.jpg` : null,
      p_poster: m.video && m.poster ? `${b}.poster.jpg` : null,
      p_web_bytes: m.web ? (m.bytes ?? null) : null,
    });
    if (r2Ready()) for (const k of old ?? []) await deleteObject(k).catch(() => undefined);
    revalidatePath(`/admin/projects/${projectId}`);
    return { ok: true, notice: m.web ? "Web version saved." : "Web version removed." };
  } catch (e) {
    return fail(e);
  }
}

/**
 * Photos delivered before share pages existed (or uploaded from a browser that couldn't make
 * the WebP): make the web versions here with sharp, a few at a time.
 */
export async function makeWebVersions(projectId: string): Promise<MediaResult> {
  try {
    const rpc = await portalAdminAction();
    if (!r2Ready()) return { ok: false, error: "File storage (R2) isn’t set up here." };
    const p = await rpc<{
      files: {
        id: string;
        kind: string;
        r2_key: string | null;
        web_key: string | null;
        deleted_at: string | null;
        direction: string;
      }[];
    }>("portal_admin_project", { p_id: projectId });
    const todo = (p.files ?? []).filter(
      (f) =>
        f.direction === "out" && f.kind === "photos" && f.r2_key && !f.web_key && !f.deleted_at,
    );
    const sharp = (await import("sharp")).default;
    const batch = todo.slice(0, 6);
    let made = 0;
    for (const f of batch) {
      const obj = await getObject(f.r2_key!);
      if (!obj) continue;
      const input = Buffer.from(await obj.arrayBuffer());
      const img = sharp(input, { failOn: "none" }).rotate();
      const [web, og] = await Promise.all([
        img
          .clone()
          .resize(2048, 2048, { fit: "inside", withoutEnlargement: true })
          .webp({ quality: 82 })
          .toBuffer(),
        img
          .clone()
          .resize(1200, 1200, { fit: "inside", withoutEnlargement: true })
          .jpeg({ quality: 80, mozjpeg: true })
          .toBuffer(),
      ]);
      const b = base(projectId, f.id);
      await putObject(`${b}.webp`, web, "image/webp");
      await putObject(`${b}.og.jpg`, og, "image/jpeg");
      await rpc("portal_admin_set_media", {
        p_file: f.id,
        p_web: `${b}.webp`,
        p_og: `${b}.og.jpg`,
        p_poster: null,
        p_web_bytes: web.length,
      });
      made++;
    }
    revalidatePath(`/admin/projects/${projectId}`);
    const left = todo.length - made;
    // Stop when a round makes nothing (originals missing or unreadable), so callers don't loop.
    if (made === 0 && left)
      return { ok: false, left: 0, error: `Couldn’t read ${left} photo${left === 1 ? "" : "s"}.` };
    return {
      ok: true,
      left,
      notice: left ? `Made ${made}; ${left} to go.` : "Every photo has its web version.",
    };
  } catch (e) {
    return fail(e);
  }
}

// ---------- share pages (§7.4) ----------

export async function disableShare(
  kind: "l" | "c",
  id: string,
  reason: string | null,
): Promise<MediaResult> {
  try {
    const rpc = await portalAdminAction();
    await rpc("portal_admin_disable_share", {
      p_kind: kind,
      p_id: id,
      p_reason: reason === null ? null : reason.trim(),
    });
    revalidatePath("/admin/listings");
    return { ok: true, notice: reason === null ? "Turned back on." : "Turned off." };
  } catch (e) {
    return fail(e);
  }
}

export async function resolveReports(kind: "l" | "c", id: string): Promise<MediaResult> {
  try {
    const rpc = await portalAdminAction();
    await rpc("portal_admin_resolve_reports", { p_kind: kind, p_id: id });
    revalidatePath("/admin/listings");
    return { ok: true, notice: "Reports cleared." };
  } catch (e) {
    return fail(e);
  }
}
