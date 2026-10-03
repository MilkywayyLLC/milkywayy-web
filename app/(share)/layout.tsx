import type { Metadata } from "next";
import "@/app/styles/share.css";

/** Public share pages (CLIENT_PORTAL_GUIDE §6.2–6.3): Viewfinder light, phone first, never indexed. */
export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true },
};

export default function ShareLayout({ children }: { children: React.ReactNode }) {
  return children;
}
