import type { SupabaseClient } from "@supabase/supabase-js";
import { presign, r2Ready } from "@/lib/r2";

/**
 * Cover thumbnails for project cards (site-refine, Oct 2026): the first delivered photo with a
 * thumbnail, from the latest delivery; with no photo, a delivered video's poster (UI rebuild,
 * 17 Oct 2026). Nothing delivered (or no R2) → no entry, and the card shows its service-icon tile
 * instead of an empty box.
 */
export async function projectCovers(db: SupabaseClient, projectIds: string[]) {
  const out = new Map<string, string>();
  if (!projectIds.length || !r2Ready()) return out;
  const { data } = await db
    .from("project_files")
    .select("project_id, kind, thumb_key, poster_key, delivery_no, created_at")
    .in("project_id", projectIds)
    .eq("direction", "out")
    .or("thumb_key.not.is.null,poster_key.not.is.null")
    .order("delivery_no", { ascending: false })
    .order("created_at", { ascending: true });
  // A photo always wins; a project with only videos falls back to the first video's poster.
  for (const f of data ?? [])
    if (f.kind === "photos" && f.thumb_key && !out.has(f.project_id))
      out.set(f.project_id, presign("GET", f.thumb_key, 3600));
  for (const f of data ?? [])
    if (f.poster_key && !out.has(f.project_id))
      out.set(f.project_id, presign("GET", f.poster_key, 3600));
  for (const f of data ?? [])
    if (f.thumb_key && !out.has(f.project_id))
      out.set(f.project_id, presign("GET", f.thumb_key, 3600));
  return out;
}
