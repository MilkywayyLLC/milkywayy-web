import { getOtherPricing, getPropertyPricing, getSiteSettings } from "@/lib/data";
import { env } from "@/lib/env";
import { formatNumber, formatUSD } from "@/lib/format";

/**
 * /llms.txt (guide §12): a plain summary for AI assistants: who Milkywayy is, the services,
 * starting prices, where we work and how to get in touch. Built from the same data as the site.
 */
export const dynamic = "force-static";
export const revalidate = 3600;

export async function GET() {
  const [site, property, other] = await Promise.all([
    getSiteSettings(),
    getPropertyPricing(),
    getOtherPricing(),
  ]);
  const base = env.siteUrl.replace(/\/$/, "");
  const fromAed = Math.min(
    ...property.apartment.sizes.map((s) => s.photo),
    ...property.villa.sizes.map((s) => s.photo),
  );
  const rates = other.postProduction.rates
    .map((r) => `${r.name} from ${formatUSD(r.amount)} per ${r.unit}`)
    .join("; ");
  const text = `# Milkywayy

> Milkywayy is a content studio in Dubai, UAE (${site.company}, ${site.licence}), creating content since 2020. Property and brand production in the UAE, remote photo and video editing worldwide, and custom AI presenter videos.

## Services

- [Production](${base}/production): monthly content packages for UAE agencies, developers and brands (shoot days, edited reels, long-form video, photography, 360 tours). Packages from AED ${formatNumber(other.production.fromMonthly)} a month.
- [Property shoots](${base}/property-shoots): real estate photography, short-form and long-form video and 360 tours in Dubai. Photography from AED ${formatNumber(fromAed)}; photos delivered in 24 hours, reels in 24–48 hours. Book online and send the request on WhatsApp.
- [Post-production](${base}/post-production): remote editing for agencies and creators worldwide. ${rates}. Free test edit available.
- [AI avatars](${base}/ai-avatars): a custom AI presenter with its own face and voice, scripted and edited into videos every month. Pricing set on a demo call.

## Where we work

Shoots across the UAE, based in Dubai. Editing and AI avatars for clients anywhere.

## Contact

- WhatsApp: ${site.whatsapp.display}
- Email: ${site.email}
- [Contact form](${base}/contact)
- [Work and case studies](${base}/work) · [About](${base}/about)
`;
  return new Response(text, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
