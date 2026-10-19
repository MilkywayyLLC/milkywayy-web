import type { PortfolioFormat, PortfolioItem } from "@/content/types";

/**
 * Items for a collage that must not mix ratios (site-refine, 3 Oct 2026): the first item's format,
 * and only items of that format. A hero trio needs three reels; otherwise it's one frame.
 */
export function oneFormat(items: PortfolioItem[], max = 3) {
  const format: PortfolioFormat | undefined = items[0]?.format;
  const same = items.filter((i) => i.format === format).slice(0, max);
  return { format, items: format === "reel" && same.length >= 3 ? same : same.slice(0, 1) };
}
