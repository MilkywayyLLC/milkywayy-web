import Link from "next/link";
import { CategoryManager } from "@/components/admin/CategoryManager";
import { LibraryBoard, type LibraryRow } from "@/components/admin/LibraryBoard";
import { requireAdmin } from "@/lib/admin/auth";
import { libRow, listCategories, listRows, placementState } from "@/lib/admin/data";
import { sectionByKey } from "@/lib/admin/sections";
import type { Media } from "@/content/types";
import { instagramStatus, reelMedia } from "@/lib/instagram";
import { OUR_INSTAGRAM } from "@/lib/instagram-link";
import { byLibrary, whereItShows, type LibItem } from "@/lib/placements";

export const metadata = { title: "Library" };

/** Library filters (also the chips). */
const KINDS: { key: string; match: (x: LibItem) => boolean }[] = [
  { key: "photos", match: (x) => x.mediaType === "photo" },
  { key: "reels", match: (x) => x.mediaType === "video" && x.orientation !== "16:9" },
  { key: "long-form", match: (x) => x.mediaType === "video" && x.orientation === "16:9" },
  { key: "avatars", match: (x) => x.mediaType === "avatar" },
  { key: "360", match: (x) => x.mediaType === "tour" },
  { key: "editing", match: (x) => x.categoryId === "editing" },
];
const TYPE_LABEL: Record<string, string> = {
  photos: "Photo",
  reels: "Reel",
  "long-form": "Long-form",
  avatars: "AI avatar",
  "360": "360 tour",
};

/**
 * Admin → Content → Library: every item, in the order the Work page and the automatic sections
 * use. Drag to reorder within a filter, switch "On Work page", jump to Edit.
 */
export default async function LibraryPage() {
  const { db } = await requireAdmin();
  const section = sectionByKey("portfolio")!;
  const [rows, categories, ig] = await Promise.all([
    listRows(db, section),
    listCategories(db),
    instagramStatus(),
  ]);
  const lib = rows.map(libRow);
  const st = await placementState(db, lib);
  const cat = new Map(categories.map((c) => [c.value, c.label]));

  // Instagram reels that can't play in our player are flagged (owner, 7 Oct 2026).
  const flags: Record<string, string> = {};
  if (process.env.INSTAGRAM_ACCESS_TOKEN?.trim())
    await Promise.all(
      lib.map(async (x) => {
        const m = x.media as Media | undefined;
        if (m?.source !== "instagram" || !m.instagram?.url) return;
        if (!m.instagram.id)
          flags[x.id] =
            `Instagram link only: not on @${OUR_INSTAGRAM}, so it can’t play on the site.`;
        else if (!(await reelMedia(m.instagram.id)))
          flags[x.id] =
            "Instagram reel unavailable: the site shows its cover with “View on Instagram ↗”.";
      }),
    );

  const items: LibraryRow[] = [...lib].sort(byLibrary).map((x) => {
    const kinds = KINDS.filter((k) => k.match(x)).map((k) => k.key);
    const type = kinds.find((k) => TYPE_LABEL[k]);
    return {
      id: x.id,
      title: x.title,
      thumb: x.thumb,
      published: x.published,
      sample: !!x.sample,
      showOnWork: x.showOnWork,
      kinds,
      meta: [type ? TYPE_LABEL[type] : "", cat.get(x.categoryId ?? "") ?? ""]
        .filter(Boolean)
        .join(" · "),
      where: whereItShows(x.id, lib, st).map((w) => w.label),
      flag: flags[x.id],
    };
  });
  const counts = Object.fromEntries(KINDS.map((k) => [k.key, lib.filter(k.match).length]));

  return (
    <>
      <LibraryBoard items={items} counts={counts} migrated={st.migrated} />
      <div className="ad-page">
        <CategoryManager categories={categories} disabled={!st.migrated} />
        <div className="ad-card" data-testid="instagram-status">
          <h2 className="ad-h2">Instagram</h2>
          <p className="ad-small">
            {!ig.connected
              ? "Not connected. Reels from Instagram show their cover with “View on Instagram ↗” until INSTAGRAM_ACCESS_TOKEN is set (LAUNCH.md → Instagram)."
              : ig.account.ok
                ? `Connected as @${ig.account.username}. The token renews itself every week${ig.expiresAt ? `; current one valid until ${new Date(ig.expiresAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}` : ""}.`
                : `Connected, but Instagram refused the token: ${ig.account.error} Replace INSTAGRAM_ACCESS_TOKEN in Vercel.`}
          </p>
          <p className="ad-small ad-muted">
            Where things show is set in <Link href="/admin/pages">Pages</Link>.
          </p>
        </div>
      </div>
    </>
  );
}
