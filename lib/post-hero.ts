import type { PortfolioItem } from "@/content/types";

type Reelish = Pick<PortfolioItem, "id" | "format" | "category">;

/**
 * Post-production hero (13 Oct 2026): always three vertical reels, laid out like Production.
 * The "Post-production hero (3 reels)" placement first; any gap is filled with the latest
 * published editing reels, then any other reels. Never the single-image fallback.
 * `pool` is every published item in portfolio order.
 */
export function postHeroReels<T extends Reelish>(placed: T[], pool: T[]): T[] {
  const reels = (xs: T[]) => xs.filter((x) => x.format === "reel");
  const out = reels(placed).slice(0, 3);
  for (const x of [...reels(pool).filter((x) => x.category === "editing"), ...reels(pool)]) {
    if (out.length >= 3) break;
    if (!out.some((o) => o.id === x.id)) out.push(x);
  }
  return out;
}
