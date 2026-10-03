import type { Metadata, Viewport } from "next";
import { Attribution } from "@/components/forms/Attribution";
import { Tracking } from "@/components/tracking/Tracking";
import { AnchorScroll } from "@/components/layout/AnchorScroll";
import { PreviewBanner } from "@/components/layout/PreviewBanner";
import { env, isIndexable } from "@/lib/env";
import { archivo, dmMono } from "./fonts";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(env.siteUrl),
  title: {
    default: "Milkywayy | Content Production Studio in Dubai",
    template: "%s | Milkywayy",
  },
  description:
    "Dubai content studio: property and brand production in the UAE, remote photo and video editing worldwide, and custom AI presenters. Creating content since 2020.",
  robots: isIndexable ? undefined : { index: false, follow: false },
  // The default share image: the brand icon on #111111. Pages set their own (/og/<page>).
  openGraph: { images: [{ url: "/brand/og.png", width: 1200, height: 630, alt: "Milkywayy" }] },
  twitter: { card: "summary_large_image", images: ["/brand/og.png"] },
};

export const viewport: Viewport = {
  themeColor: "#111111",
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // data-scroll-behavior: Next 16 only suspends the CSS smooth scrolling during route changes when
    // this is set; without it, a page change animates up from the old position instead of opening
    // at the top.
    <html
      lang="en"
      className={`${archivo.variable} ${dmMono.variable}`}
      data-scroll-behavior="smooth"
    >
      <body>
        <a className="skip-link" href="#main">
          Skip to content
        </a>
        <PreviewBanner />
        {children}
        <AnchorScroll />
        <Attribution />
        <Tracking />
      </body>
    </html>
  );
}
