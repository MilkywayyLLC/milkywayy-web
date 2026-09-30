import type { MetadataRoute } from "next";
import { env, isIndexable } from "@/lib/env";

export default function robots(): MetadataRoute.Robots {
  if (!isIndexable) return { rules: { userAgent: "*", disallow: "/" } };
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/admin", "/styleguide", "/api"] },
    sitemap: `${env.siteUrl}/sitemap.xml`,
  };
}
