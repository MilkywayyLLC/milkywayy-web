import type { Metadata } from "next";
import "@/app/styles/portal.css";

/** Client portal (CLIENT_PORTAL_GUIDE.md). Light tone, never indexed. */
export const metadata: Metadata = {
  title: { default: "Client portal", template: "%s · Milkywayy portal" },
  robots: { index: false, follow: false },
};

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="pt" data-tone="light">
      {children}
    </div>
  );
}
