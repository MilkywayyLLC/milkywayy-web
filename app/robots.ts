import type { MetadataRoute } from "next";
import { env, isIndexable } from "@/lib/env";

/** Staging and local: nothing is crawled (guide §12 staging lock). Production: all but private areas. */
export default function robots(): MetadataRoute.Robots {
  if (!isIndexable) return { rules: { userAgent: "*", disallow: "/" } };
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/admin", "/styleguide", "/api", "/portal", "/og/"],
    },
    sitemap: `${env.siteUrl.replace(/\/$/, "")}/sitemap.xml`,
    host: env.siteUrl,
  };
}
