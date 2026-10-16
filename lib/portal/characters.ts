import type { SupabaseClient } from "@supabase/supabase-js";
import { pageMediaUrl } from "@/lib/r2";

/**
 * AI avatar characters (17 Oct 2026): a brief, 3 variations a round, the client picks one or asks
 * for changes (unlimited rounds, each logged), Milkywayy approves it with a name. Avatar videos
 * then choose their presenter(s) from the approved ones.
 */
export type CharacterStatus =
  "brief_received" | "variations_ready" | "revision_requested" | "picked" | "approved";

export const CHARACTER_STATUS: Record<CharacterStatus, string> = {
  brief_received: "Brief received",
  variations_ready: "Variations ready",
  revision_requested: "Revision requested",
  picked: "Picked · finalising",
  approved: "Approved",
};

export const PURPOSES = [
  ["ads", "Ads"],
  ["engagement", "Engagement"],
  ["explainers", "Explainers"],
  ["other", "Other"],
] as const;
export type Purpose = (typeof PURPOSES)[number][0];

export type CharacterBrief = {
  brand: string;
  purpose: Purpose;
  purpose_other?: string;
  look: string;
  setting?: string;
  voice?: string;
  language?: string;
  links?: string[];
  similar_note?: string;
};

export type CharacterFile = {
  id: string;
  character_id: string;
  kind: "variation" | "pack" | "reference";
  round: number;
  label: string;
  r2_key: string | null;
  url: string | null;
  bytes: number | null;
  content_type: string | null;
  created_at: string;
  /** A short-lived image URL (server-signed), when it's an image in R2. */
  src?: string | null;
};

export type CharacterEvent = {
  id: string;
  kind: "brief" | "variations" | "picked" | "changes" | "approved" | "renamed";
  round: number;
  file_id: string | null;
  note: string | null;
  actor_name: string | null;
  by_admin: boolean;
  created_at: string;
};

export type Character = {
  id: string;
  account_id: string;
  account_name?: string;
  name: string | null;
  status: CharacterStatus;
  brief: CharacterBrief;
  round: number;
  picked_file_id: string | null;
  approved_file_id: string | null;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
  files: CharacterFile[];
  events: CharacterEvent[];
};

export const characterTitle = (c: Pick<Character, "name" | "brief">) =>
  c.name || `Character for ${c.brief.brand.slice(0, 40)}`;

/** The image a card shows: the approved one, else the pick, else the latest round's first. */
export function coverOf(c: Character) {
  const v = c.files.filter((f) => f.kind === "variation" && f.round <= c.round);
  return (
    v.find((f) => f.id === c.approved_file_id) ??
    v.find((f) => f.id === c.picked_file_id) ??
    v.filter((f) => f.round === c.round)[0] ??
    null
  );
}

/** Which variation a revision note points at: "Variation 2 of round 1". */
export function variationName(c: Character, fileId: string | null) {
  const f = c.files.find((x) => x.id === fileId);
  if (!f) return null;
  const n = c.files.filter((x) => x.kind === "variation" && x.round === f.round).indexOf(f) + 1;
  return `Variation ${n} of round ${f.round}`;
}

export const isImage = (f: Pick<CharacterFile, "content_type" | "label">) =>
  /^image\//.test(f.content_type ?? "") || /\.(png|jpe?g|webp|gif|avif)$/i.test(f.label);

/** Signs image URLs (only for files the caller already read: RLS or the admin gate). */
export const withSrc = (f: CharacterFile): CharacterFile => ({
  ...f,
  src: f.r2_key && isImage(f) ? pageMediaUrl(f.r2_key) : f.url && isImage(f) ? f.url : null,
});

/** The account's characters, as the signed-in client may see them (RLS: avatar members). */
export async function myCharacters(db: SupabaseClient, accountId: string): Promise<Character[]> {
  const { data: chars, error } = await db
    .from("ai_characters")
    .select("*")
    .eq("account_id", accountId)
    .order("created_at", { ascending: false });
  if (error) {
    // Fail safe: a missing table (migration not applied yet) is just "no characters".
    console.error("[portal] characters:", error.message);
    return [];
  }
  const ids = (chars ?? []).map((c) => c.id as string);
  if (!ids.length) return [];
  const [{ data: files }, { data: events }] = await Promise.all([
    db
      .from("ai_character_files")
      .select("*")
      .in("character_id", ids)
      .order("round")
      .order("created_at"),
    db.from("ai_character_events").select("*").in("character_id", ids).order("created_at"),
  ]);
  return (chars ?? []).map((c) => ({
    ...(c as Omit<Character, "files" | "events">),
    // Variations of a round still being prepared stay hidden from the client.
    files: ((files ?? []) as CharacterFile[])
      .filter((f) => f.character_id === c.id && !(f.kind === "variation" && f.round > c.round))
      .map(withSrc),
    events: ((events ?? []) as (CharacterEvent & { character_id: string })[]).filter(
      (e) => e.character_id === c.id,
    ),
  }));
}
