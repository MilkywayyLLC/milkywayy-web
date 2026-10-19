import type { ReactNode } from "react";
import type { Tone } from "@/content/types";
import { JsonLd } from "@/components/seo/JsonLd";
import { getSiteSettings } from "@/lib/data";
import { businessLd } from "@/lib/seo/schema";
import { Footer } from "./Footer";
import { Header } from "./Header";

/**
 * Every public page: tone wrapper → sticky header → main → footer (always dark).
 * The header sits inside the wrapper so it takes the page tone (guide §4.1). No sticky mobile
 * bar on public pages: the nav already carries "Get a quote".
 */
export async function SiteShell({ tone, children }: { tone: Tone; children: ReactNode }) {
  const site = await getSiteSettings();
  return (
    <div data-tone={tone} className="tone-root">
      <Header whatsapp={site.whatsapp.number} tone={tone} />
      <main id="main" tabIndex={-1}>
        {children}
      </main>
      <Footer site={site} />
      <JsonLd data={businessLd(site)} />
    </div>
  );
}
