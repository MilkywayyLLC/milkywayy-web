import { NextResponse, type NextRequest } from "next/server";
import sharp, { type OutputInfo } from "sharp";
import { getAdmin } from "@/lib/admin/auth";

/**
 * Image upload (guide §18.1). The browser shrinks the photo first (so phone photos fit the
 * request limit); here it's turned upright, capped at 2400 px on the long side, converted to
 * WebP and saved to the public `media` bucket as the signed-in admin (storage RLS: admins only).
 */
export const runtime = "nodejs";

const MAX_BYTES = 15 * 1024 * 1024;
const LONG_EDGE = 2400;

export async function POST(req: NextRequest) {
  const admin = await getAdmin();
  if (admin.state !== "ok") return NextResponse.json({ error: "Sign in again." }, { status: 401 });

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof Blob))
    return NextResponse.json({ error: "No image received." }, { status: 400 });
  if (file.size > MAX_BYTES)
    return NextResponse.json({ error: "That image is over 15 MB." }, { status: 413 });

  let out: { data: Buffer; info: OutputInfo };
  try {
    out = await sharp(Buffer.from(await file.arrayBuffer()), { failOn: "error" })
      .rotate()
      .resize({ width: LONG_EDGE, height: LONG_EDGE, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer({ resolveWithObject: true });
  } catch {
    return NextResponse.json({ error: "That file isn't an image we can read." }, { status: 415 });
  }

  const now = new Date();
  const path = `uploads/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}/${crypto.randomUUID()}.webp`;
  const { error } = await admin.db.storage
    .from("media")
    .upload(path, out.data, { contentType: "image/webp", cacheControl: "31536000", upsert: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 403 });

  const src = admin.db.storage.from("media").getPublicUrl(path).data.publicUrl;
  await admin.db.from("change_log").insert({
    entity: "media",
    entity_id: path,
    action: "upload",
    summary: `Uploaded an image (${out.info.width}×${out.info.height}, ${Math.round(out.info.size / 1024)} KB WebP)`,
  });
  return NextResponse.json({
    src,
    width: out.info.width,
    height: out.info.height,
    bytes: out.info.size,
  });
}
