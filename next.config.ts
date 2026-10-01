import type { NextConfig } from "next";

const indexable = process.env.NEXT_PUBLIC_SITE_ENV === "production";

const nextConfig: NextConfig = {
  // Only the fallback test sets this, to run a second server on its own copy of the build.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  images: {
    formats: ["image/avif", "image/webp"],
    // Images uploaded in the admin (Supabase Storage, public `media` bucket).
    remotePatterns: process.env.NEXT_PUBLIC_SUPABASE_URL
      ? [new URL(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/media/**`)]
      : [],
  },
  async redirects() {
    // Property shoots and the booking builder merged into /property-shoots (owner, 1 Oct 2026).
    return [
      { source: "/production/property-shoots", destination: "/property-shoots", statusCode: 301 },
      { source: "/book", destination: "/property-shoots", statusCode: 301 },
      // The current milkywayy.com (crawled 2 Oct 2026; its pages are noindex, so this is about
      // bookmarks and shared links rather than rankings). See DECISIONS.md "Phase 7".
      { source: "/booking", destination: "/property-shoots", statusCode: 301 },
      { source: "/booking/:path*", destination: "/property-shoots", statusCode: 301 },
      { source: "/portfolio", destination: "/work", statusCode: 301 },
      { source: "/portfolio/:path*", destination: "/work", statusCode: 301 },
      { source: "/privacy-policy", destination: "/privacy", statusCode: 301 },
      // Common variants people type or other sites link to.
      { source: "/about-us", destination: "/about", statusCode: 301 },
      { source: "/contact-us", destination: "/contact", statusCode: 301 },
      { source: "/terms-and-conditions", destination: "/terms", statusCode: 301 },
      { source: "/services", destination: "/", statusCode: 301 },
      // The old client portal and its share links: temporary until the portal moves to its
      // subdomain (CLIENT_PORTAL_GUIDE §11), so browsers don't remember these.
      { source: "/dashboard", destination: "/client-login", permanent: false },
      { source: "/dashboard/:path*", destination: "/client-login", permanent: false },
      { source: "/c/:path*", destination: "/client-login", permanent: false },
      { source: "/l/:path*", destination: "/client-login", permanent: false },
    ];
  },
  async headers() {
    // Staging lock (guide §12): belt and braces on top of the metadata robots tag.
    if (indexable) return [];
    return [{ source: "/:path*", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }] }];
  },
};

export default nextConfig;
