import type { ReactNode } from "react";
import type { Tone } from "@/content/types";
import { JsonLd } from "@/components/seo/JsonLd";
import { getSiteSettings } from "@/lib/data";
import { businessLd } from "@/lib/seo/schema";
import { Footer } from "./Footer";
import { Header } from "./Header";
import { PageMobileBar } from "./PageMobileBar";

/**
 * Every public page: tone wrapper → sticky header → main → footer (always dark) → mobile bar.
 * The header and mobile bar sit inside the wrapper so they take the page tone (guide §4.1).
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
      <PageMobileBar whatsapp={site.whatsapp.number} />
      <JsonLd data={businessLd(site)} />
    </div>
  );
}
