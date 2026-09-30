import { SiteShell } from "@/components/layout/SiteShell";

/** Dark-tone pages: Home, Production, Property shoots, /book, Work, About (guide §3). */
export default function DarkLayout({ children }: { children: React.ReactNode }) {
  return <SiteShell tone="dark">{children}</SiteShell>;
}
