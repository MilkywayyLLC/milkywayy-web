import { portalAdminReady, portalAdminSystem } from "@/lib/portal/admin";
import { portalDb } from "@/lib/portal/supabase";
import { makeStoredThumb } from "@/lib/portal/thumb-server";
import { isPhoto } from "@/lib/portal/thumbs";
import { presign } from "@/lib/r2";

/**
 * A photo's preview (phase 1 part 6): the stored `<key>.thumb.webp`, or made here from the original
 * (800px WebP), stored and recorded so it's made once. Only for someone who can see the file (RLS).
 * Locked deliveries never come here: they use the watermarked /api/portal/preview.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return new Response("Not found", { status: 404 });
  const db = await portalDb();
  if (!db) return new Response("Not found", { status: 404 });
  const { data: f } = await db
    .from("project_files")
    .select("id, source, r2_key, thumb_key, content_type, label")
    .eq("id", id)
    .maybeSingle();
  if (!f || f.source !== "r2" || !f.r2_key || !isPhoto(f))
    return new Response("Not found", { status: 404 });
  if (f.thumb_key) return Response.redirect(presign("GET", f.thumb_key, 3600), 302);
  try {
    const made = await makeStoredThumb(f.r2_key);
    if (!made) return new Response("Not found", { status: 404 });
    const { key, out } = made;
    // Recorded so it's made once; serving it doesn't wait on that going right.
    if (portalAdminReady())
      await portalAdminSystem("portal_admin_set_thumb", { p_file: f.id, p_thumb_key: key }).catch(
        (e) => console.error("[thumb] record:", e instanceof Error ? e.message : e),
      );
    return new Response(new Uint8Array(out), {
      headers: {
        "Content-Type": "image/webp",
        "Cache-Control": "private, max-age=3600",
        "X-Robots-Tag": "noindex",
      },
    });
  } catch (e) {
    console.error("[thumb]", e instanceof Error ? e.message : e);
    return new Response("Not found", { status: 404 });
  }
}
