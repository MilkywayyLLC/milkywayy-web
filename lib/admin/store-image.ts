import type { SupabaseClient } from "@supabase/supabase-js";
import sharp, { type OutputInfo } from "sharp";

/**
 * How every admin image is stored (guide §18.1): turned upright, capped at 2400 px on the long
 * side, converted to WebP and saved to the public `media` bucket as the signed-in admin
 * (storage RLS: admins only). Used by uploads and by "Use the reel's cover" (Instagram).
 */
export const IMAGE_MAX_BYTES = 15 * 1024 * 1024;
const LONG_EDGE = 2400;

export type Stored = { src: string; width: number; height: number; bytes: number };

export async function storeImage(
  db: SupabaseClient,
  input: Buffer,
  what = "an image",
): Promise<Stored | { error: string; status: number }> {
  let out: { data: Buffer; info: OutputInfo };
  try {
    out = await sharp(input, { failOn: "error" })
      .rotate()
      .resize({ width: LONG_EDGE, height: LONG_EDGE, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer({ resolveWithObject: true });
  } catch {
    return { error: "That file isn't an image we can read.", status: 415 };
  }
  const now = new Date();
  const path = `uploads/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}/${crypto.randomUUID()}.webp`;
  const { error } = await db.storage
    .from("media")
    .upload(path, out.data, { contentType: "image/webp", cacheControl: "31536000", upsert: false });
  if (error) return { error: error.message, status: 403 };
  const src = db.storage.from("media").getPublicUrl(path).data.publicUrl;
  await db.from("change_log").insert({
    entity: "media",
    entity_id: path,
    action: "upload",
    summary: `Uploaded ${what} (${out.info.width}×${out.info.height}, ${Math.round(out.info.size / 1024)} KB WebP)`,
  });
  return { src, width: out.info.width, height: out.info.height, bytes: out.info.size };
}
