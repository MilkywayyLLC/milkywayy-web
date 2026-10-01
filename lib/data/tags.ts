/**
 * Cache tags for editable content. The admin (5B) and /api/revalidate invalidate these after a save
 * so the change is live on the next page load (guide §18.1).
 */
export const TAGS = {
  site: "site",
  clients: "clients",
  stats: "stats",
  faqs: "faqs",
  reviews: "reviews",
  portfolio: "portfolio",
  caseStudies: "case-studies",
  beforeAfter: "before-after",
  avatars: "avatars",
  pricing: "pricing",
  seo: "seo",
} as const;

export type Tag = (typeof TAGS)[keyof typeof TAGS];
export const ALL_TAGS = Object.values(TAGS) as Tag[];
