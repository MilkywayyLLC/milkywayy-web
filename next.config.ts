import type { NextConfig } from "next";

const indexable = process.env.NEXT_PUBLIC_SITE_ENV === "production";

const nextConfig: NextConfig = {
  images: {
    formats: ["image/avif", "image/webp"],
  },
  async headers() {
    // Staging lock (guide §12): belt and braces on top of the metadata robots tag.
    if (indexable) return [];
    return [{ source: "/:path*", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }] }];
  },
};

export default nextConfig;
