import type { SupabaseClient } from "@supabase/supabase-js";
import { r2Ready } from "@/lib/r2";
import { thumbSrc } from "./thumbs";

/**
 * Cover thumbnails for project cards (site-refine, Oct 2026): the first delivered photo with a
 * thumbnail, from the latest delivery. Nothing delivered (or no R2) → no entry, and the card
 * shows its category icon tile instead of an empty box.
 */
export async function projectCovers(db: SupabaseClient, projectIds: string[]) {
  const out = new Map<string, string>();
  if (!projectIds.length || !r2Ready()) return out;
  const { data } = await db
    .from("project_files")
    .select(
      "id, project_id, source, r2_key, thumb_key, content_type, label, kind, delivery_no, created_at",
    )
    .in("project_id", projectIds)
    .eq("direction", "out")
    .eq("kind", "photos")
    .order("delivery_no", { ascending: false })
    .order("created_at", { ascending: true });
  // The first photo of the latest delivery; its preview is made on the server if missing (phase 1).
  for (const f of data ?? []) {
    if (out.has(f.project_id)) continue;
    const src = thumbSrc(f);
    if (src) out.set(f.project_id, src);
  }
  return out;
}
