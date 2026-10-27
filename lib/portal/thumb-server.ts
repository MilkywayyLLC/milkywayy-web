import sharp from "sharp";
import { getObject, putObject } from "@/lib/r2";

/**
 * Make and store a photo's preview on the server (phase 1 part 6): `<key>.thumb.webp`, 800px.
 * Returns the bytes and the key, or null if the original can't be read. Recording it on the file
 * (portal_admin_set_thumb) is the caller's job.
 */
export async function makeStoredThumb(r2Key: string) {
  const obj = await getObject(r2Key);
  if (!obj) return null;
  const out = await sharp(Buffer.from(await obj.arrayBuffer()))
    .rotate()
    .resize(800, 800, { fit: "inside", withoutEnlargement: true })
    .webp({ quality: 80 })
    .toBuffer();
  const key = `${r2Key}.thumb.webp`;
  await putObject(key, out, "image/webp");
  return { key, out };
}
