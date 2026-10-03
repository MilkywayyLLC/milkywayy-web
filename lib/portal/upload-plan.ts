import { randomUUID } from "node:crypto";
import {
  listParts,
  maxUploadBytes,
  maxUploadGb,
  PART_SIZE,
  partUrl,
  presign,
  r2Ready,
  startMultipart,
} from "@/lib/r2";

/** Server half of an upload (lib/upload-browser is the browser half): sign one PUT or the parts. */
export type ServerPlan =
  | { ok: false; error: string }
  | {
      ok: true;
      key: string;
      single?: string;
      uploadId?: string;
      parts?: { partNumber: number; url: string }[];
      done?: { partNumber: number; etag: string }[];
    };

export const safeName = (name: string) =>
  name
    .replace(/[^\w.\- ()]+/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(-120) || "file";

export async function planUpload(folder: string, name: string, size: number): Promise<ServerPlan> {
  if (!r2Ready()) return { ok: false, error: "Uploads aren’t set up yet. Paste a link instead." };
  if (!(size > 0) || size > maxUploadBytes())
    return {
      ok: false,
      error: `Files can be up to ${maxUploadGb()} GB. Paste a link for bigger ones.`,
    };
  const key = `${folder}/${randomUUID().slice(0, 8)}-${safeName(name)}`;
  if (size <= PART_SIZE) return { ok: true, key, single: presign("PUT", key, 3600) };
  const uploadId = await startMultipart(key);
  const parts = Array.from({ length: Math.ceil(size / PART_SIZE) }, (_, i) => ({
    partNumber: i + 1,
    url: partUrl(key, uploadId, i + 1),
  }));
  return { ok: true, key, uploadId, parts };
}

export async function planResume(key: string, uploadId: string, size: number): Promise<ServerPlan> {
  const have = await listParts(key, uploadId);
  const parts = Array.from({ length: Math.ceil(size / PART_SIZE) }, (_, i) => i + 1)
    .filter((n) => !have.some((h) => h.partNumber === n))
    .map((n) => ({ partNumber: n, url: partUrl(key, uploadId, n) }));
  return { ok: true, key, uploadId, parts, done: have };
}
