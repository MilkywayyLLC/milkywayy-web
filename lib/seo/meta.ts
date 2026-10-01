import type { Metadata } from "next";
import { getSeoOverride } from "@/lib/data";
import { seoPage } from "./pages";

/**
 * A page's metadata: the defaults in ./pages with the admin's overrides on top. Canonical URLs
 * resolve against NEXT_PUBLIC_SITE_URL (https://milkywayy.com) via metadataBase.
 */
export async function pageMetadata(key: string): Promise<Metadata> {
  const p = seoPage(key);
  if (!p) throw new Error(`No SEO entry for "${key}"`);
  const o = await getSeoOverride(key);
  return build({
    title: o.title || p.title,
    description: o.description || p.description,
    path: p.path,
    image: o.ogImage || `/og/${key}`,
  });
}

export function build({
  title,
  description,
  path,
  image,
}: {
  title: string;
  description: string;
  path: string;
  image: string;
}): Metadata {
  return {
    title: { absolute: title },
    description,
    alternates: { canonical: path },
    openGraph: {
      type: "website",
      siteName: "Milkywayy",
      locale: "en_AE",
      url: path,
      title,
      description,
      images: [{ url: image, width: 1200, height: 630, alt: title }],
    },
    twitter: { card: "summary_large_image", title, description, images: [image] },
  };
}
