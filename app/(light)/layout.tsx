import { SiteShell } from "@/components/layout/SiteShell";

/** Light-tone pages: Post-production, AI avatars, Contact, legal (guide §3). */
export default function LightLayout({ children }: { children: React.ReactNode }) {
  return <SiteShell tone="light">{children}</SiteShell>;
}
