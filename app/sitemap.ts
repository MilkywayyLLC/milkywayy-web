import type { MetadataRoute } from "next";
import { getCaseStudies } from "@/lib/data";
import { env } from "@/lib/env";
import { SEO_PAGES } from "@/lib/seo/pages";

/** sitemap.xml: every public page and case study (no admin, styleguide or client login). */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = env.siteUrl.replace(/\/$/, "");
  const cases = await getCaseStudies();
  return [
    ...SEO_PAGES.filter((p) => p.sitemap).map((p) => ({
      url: `${base}${p.path === "/" ? "" : p.path}`,
      changeFrequency: "weekly" as const,
      priority: p.sitemap,
    })),
    ...cases.map((c) => ({
      url: `${base}/work/${c.slug}`,
      changeFrequency: "monthly" as const,
      priority: 0.5,
    })),
  ];
}
