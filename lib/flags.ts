/**
 * Site feature flags. Case studies are hidden for now (owner, 12 Oct 2026): off the Work page,
 * the sitemap and share images, and /work/<slug> returns 404. Code, admin and data stay; set
 * NEXT_PUBLIC_SHOW_CASE_STUDIES=1 to bring them back.
 */
export const flags = {
  caseStudies: process.env.NEXT_PUBLIC_SHOW_CASE_STUDIES === "1",
} as const;
