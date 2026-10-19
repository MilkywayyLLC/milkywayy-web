import { NextResponse, type NextRequest } from "next/server";
import { getAdmin } from "@/lib/admin/auth";
import { IMAGE_MAX_BYTES, storeImage } from "@/lib/admin/store-image";

/**
 * Image upload (guide §18.1). The browser shrinks the photo first (so phone photos fit the
 * request limit); lib/admin/store-image.ts makes the WebP and saves it.
 */
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const admin = await getAdmin();
  if (admin.state !== "ok") return NextResponse.json({ error: "Sign in again." }, { status: 401 });

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof Blob))
    return NextResponse.json({ error: "No image received." }, { status: 400 });
  if (file.size > IMAGE_MAX_BYTES)
    return NextResponse.json({ error: "That image is over 15 MB." }, { status: 413 });

  const r = await storeImage(admin.db, Buffer.from(await file.arrayBuffer()));
  if ("error" in r) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json(r);
}
