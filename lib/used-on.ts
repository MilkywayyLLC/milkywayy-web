import type { PortfolioItem, PortfolioPlacement } from "@/content/types";
import { realFirst } from "@/lib/data/sample";
import { kindOf } from "@/lib/media-config";
import { oneFormat } from "@/lib/media";

/**
 * "Used on" in the admin (owner, 7 Oct 2026): the exact places a portfolio item appears right
 * now, worked out with the same rules the pages use (placement order, samples hiding once real
 * work exists, one item per service row, one-format hero collages, gallery tabs). The editor
 * recomputes it as placements are ticked, so it's always current.
 */
export type UsageItem = Pick<
  PortfolioItem,
  "id" | "format" | "category" | "placements" | "placementOrder" | "sortOrder" | "sample"
> & { published: boolean };

/** Gallery tab names, as the site shows them (components/blocks/FormatGallery). */
export const TAB_LABEL = {
  photo: "Photos",
  reel: "Reels",
  "long-form": "Long-form",
  "360": "360° tours",
  "ai-avatar": "AI avatars",
} as const;
export type GalleryTab = keyof typeof TAB_LABEL;

export const inTab = (tab: GalleryTab, i: Pick<PortfolioItem, "category" | "format">) =>
  tab === "ai-avatar" ? i.category === "ai-avatar" : i.category !== "ai-avatar" && i.format === tab;

const tabOf = (i: Pick<PortfolioItem, "category" | "format">, tabs: GalleryTab[]) =>
  tabs.find((t) => inTab(t, i));

/** /work shows every format, 360 tours included. */
export const WORK_TABS: GalleryTab[] = ["photo", "reel", "long-form", "360", "ai-avatar"];

/** What a placement shows, in order (getPortfolio). */
function shown<T extends UsageItem>(all: T[], p: PortfolioPlacement): T[] {
  const pos = (x: T) => x.placementOrder?.[p] ?? x.sortOrder;
  return realFirst(
    all.filter((x) => x.published && x.placements.includes(p)).sort((a, b) => pos(a) - pos(b)),
  );
}

/** The Post-production service rows take the first item of each format (app/(light)/post-production). */
export const POST_ROWS = [
  { format: "photo", label: "Photo edits" },
  { format: "reel", label: "Short-form reels" },
  { format: "long-form", label: "Long-form" },
] as const;

export function usedOn(item: UsageItem, all: UsageItem[]): string[] {
  // The item as it will be once live (the editor's unsaved values), among everything else.
  const me = { ...item, published: true };
  const pool = [...all.filter((x) => x.id !== item.id), me];
  const has = (p: PortfolioPlacement) => shown(pool, p).some((x) => x.id === item.id);
  const first = (p: PortfolioPlacement) => shown(pool, p)[0]?.id === item.id;
  const out: string[] = [];

  if (first("home-row-production")) out.push("Home → Services row (Production)");
  if (first("home-row-post")) out.push("Home → Services row (Post-production)");
  if (first("home-row-avatars")) out.push("Home → Services row (AI avatars)");

  const prodHero = oneFormat(shown(pool, "production-hero") as unknown as PortfolioItem[]);
  if (prodHero.items.some((x) => x.id === item.id)) out.push("Production → Hero");
  if (first("property-hero")) out.push("Property shoots → Hero");

  const propTabs: GalleryTab[] = ["photo", "reel", "long-form", "360"];
  const gallery = (
    ["property-gallery-photo", "property-gallery-video", "property-gallery-360"] as const
  ).some(has);
  const propTab = tabOf(item, propTabs);
  if (gallery && propTab) out.push(`Property shoots → Samples (${TAB_LABEL[propTab]})`);

  const postHero = oneFormat(shown(pool, "post-hero") as unknown as PortfolioItem[]);
  if (postHero.items.some((x) => x.id === item.id)) out.push("Post-production → Hero");
  const cards = shown(pool, "post-service-cards");
  for (const row of POST_ROWS)
    if (cards.find((x) => kindOf(x) === row.format)?.id === item.id)
      out.push(`Post-production → Services row (${row.label})`);
  const postTabs: GalleryTab[] = ["photo", "reel", "long-form", "ai-avatar"];
  const postTab = tabOf(item, postTabs);
  if ((has("post-hero") || has("post-service-cards")) && postTab)
    out.push(`Post-production → Work we've delivered (${TAB_LABEL[postTab]})`);

  const workTab = tabOf(item, WORK_TABS);
  if (has("work") && workTab) out.push(`/work → ${TAB_LABEL[workTab]} tab`);
  return out;
}
