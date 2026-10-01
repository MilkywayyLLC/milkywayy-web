import { draftMode } from "next/headers";
import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import { getAdmin } from "@/lib/admin/auth";
import { safePreviewPath } from "@/lib/admin/preview";

/**
 * Preview: GET /admin/preview?path=/post-production. Signed-in admins only. Switches on Next.js
 * Draft Mode for this browser, so pages show drafts and unpublished items (lib/data/index.ts).
 */
export async function GET(req: NextRequest) {
  const admin = await getAdmin();
  if (admin.state !== "ok") redirect("/admin/login");
  (await draftMode()).enable();
  redirect(safePreviewPath(req.nextUrl.searchParams.get("path")));
}
