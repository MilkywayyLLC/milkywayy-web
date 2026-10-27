import type { Metadata, Viewport } from "next";
import "@/app/styles/share.css";
import "@/app/styles/share-phase1.css";

/**
 * Public share pages (CLIENT_PORTAL_GUIDE §6.2–6.3): phone first, never indexed. Phase 1: light, or
 * dark when the visitor's device prefers it (data-tone="auto").
 */
export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true },
};
export const viewport: Viewport = {
  colorScheme: "light dark",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f6f3" },
    { media: "(prefers-color-scheme: dark)", color: "#0e0e0d" },
  ],
};

export default function ShareLayout({ children }: { children: React.ReactNode }) {
  return children;
}
