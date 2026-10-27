import type { Metadata } from "next";
import "@/app/styles/portal.css";
import "@/app/styles/portal-v2.css";
import "@/app/styles/portal-phase1.css";

/** Client portal (CLIENT_PORTAL_GUIDE.md). Dark tone (V2 reskin, 25 Oct 2026), never indexed. */
export const metadata: Metadata = {
  title: { default: "Client portal", template: "%s · Milkywayy portal" },
  robots: { index: false, follow: false },
};

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="pt" data-tone="dark">
      {children}
    </div>
  );
}
