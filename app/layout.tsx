import type { Metadata, Viewport } from "next";
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
};

export const viewport: Viewport = {
  themeColor: "#111111",
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${archivo.variable} ${dmMono.variable}`}>
      <body>
        <a className="skip-link" href="#main">
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
