import { draftMode } from "next/headers";
import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import { safePreviewPath } from "@/lib/admin/preview";

/** Leaves preview (the form on the preview bar) and returns to the same page, live. */
export async function GET(req: NextRequest) {
  (await draftMode()).disable();
  const from = req.headers.get("referer");
  const path = from && new URL(from).origin === req.nextUrl.origin ? new URL(from).pathname : "/";
  redirect(safePreviewPath(path));
}
