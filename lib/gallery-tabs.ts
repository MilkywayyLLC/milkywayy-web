import type { PortfolioItem } from "@/content/types";

/**
 * The portfolio gallery's tabs (components/blocks/FormatGallery, /work). Kept apart from
 * lib/used-on so the public pages don't ship the admin's "Used on" logic.
 */
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

/** /work shows every format, 360 tours included. */
export const WORK_TABS: GalleryTab[] = ["photo", "reel", "long-form", "360", "ai-avatar"];
