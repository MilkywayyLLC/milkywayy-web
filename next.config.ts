import type { NextConfig } from "next";

const indexable = process.env.NEXT_PUBLIC_SITE_ENV === "production";

const nextConfig: NextConfig = {
  // Only the fallback test sets this, to run a second server on its own copy of the build.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  images: {
    formats: ["image/avif", "image/webp"],
  },
  async redirects() {
    // Property shoots and the booking builder merged into /property-shoots (owner, 1 Oct 2026).
    return [
      { source: "/production/property-shoots", destination: "/property-shoots", statusCode: 301 },
      { source: "/book", destination: "/property-shoots", statusCode: 301 },
      { source: "/booking", destination: "/property-shoots", statusCode: 301 },
    ];
  },
  async headers() {
    // Staging lock (guide §12): belt and braces on top of the metadata robots tag.
    if (indexable) return [];
    return [{ source: "/:path*", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }] }];
  },
};

export default nextConfig;
