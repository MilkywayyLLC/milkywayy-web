import type { Metadata } from "next";
import { PersonaProvider } from "@/components/portal-mock/persona";
import { PreviewBar } from "@/components/portal-mock/PreviewBar";
import "@/app/styles/portal.css";

/** Clickable portal mockup (CLIENT_PORTAL_GUIDE.md Phase 9 step 1). Fake data, nothing saved. */
export const metadata: Metadata = {
  title: { default: "Portal mockup", template: "%s · Portal mockup" },
  robots: { index: false, follow: false },
};

export default function PortalPreview({ children }: { children: React.ReactNode }) {
  return (
    <div className="pt" data-tone="light" data-mock>
      <PersonaProvider>
        <PreviewBar />
        {children}
      </PersonaProvider>
    </div>
  );
}
