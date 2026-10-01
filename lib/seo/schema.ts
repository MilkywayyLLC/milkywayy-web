import type { OtherPricing, PropertyPricing, SiteSettings } from "@/content/types";
import { env } from "@/lib/env";
import { seoPage, type SeoPage } from "./pages";

/** Structured data (guide §12). Absolute URLs on NEXT_PUBLIC_SITE_URL (https://milkywayy.com). */
const base = env.siteUrl.replace(/\/$/, "");
const abs = (p: string) => `${base}${p === "/" ? "/" : p}`;
export const ORG_ID = `${base}/#organization`;
export const BUSINESS_ID = `${base}/#business`;

/** Organization + ProfessionalService (a LocalBusiness) for Milkywayy in Dubai: every public page. */
export function businessLd(site: SiteSettings) {
  const sameAs = [site.instagram.url, site.linkedin.url, site.googleRating.url].filter(Boolean);
  const phone = `+${site.whatsapp.number}`;
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": ORG_ID,
        name: "Milkywayy",
        legalName: site.company,
        url: abs("/"),
        logo: { "@type": "ImageObject", url: abs("/og/logo"), width: 512, height: 512 },
        email: site.email,
        telephone: phone,
        sameAs,
      },
      {
        "@type": "ProfessionalService",
        "@id": BUSINESS_ID,
        name: "Milkywayy",
        description:
          "Dubai content studio: property and brand production in the UAE, remote photo and video editing worldwide, and custom AI presenters.",
        url: abs("/"),
        image: abs("/og/home"),
        logo: abs("/og/logo"),
        telephone: phone,
        email: site.email,
        priceRange: "AED 450+",
        address: { "@type": "PostalAddress", addressLocality: "Dubai", addressCountry: "AE" },
        areaServed: [
          { "@type": "City", name: "Dubai" },
          { "@type": "Country", name: "United Arab Emirates" },
        ],
        parentOrganization: { "@id": ORG_ID },
        sameAs,
        // Only once the review count is confirmed (guide §12).
        ...(site.googleRating.count
          ? {
              aggregateRating: {
                "@type": "AggregateRating",
                ratingValue: site.googleRating.value,
                reviewCount: site.googleRating.count,
                bestRating: 5,
              },
            }
          : {}),
      },
    ],
  };
}

/** Service with its starting price, for each service page. */
export function serviceLd(
  key: string,
  prices: { property?: PropertyPricing; other?: OtherPricing },
) {
  const p = seoPage(key)!;
  const { property, other } = prices;
  const offers: Record<string, object | undefined> = {
    production: other && {
      "@type": "Offer",
      priceCurrency: "AED",
      price: other.production.fromMonthly,
      priceSpecification: {
        "@type": "UnitPriceSpecification",
        price: other.production.fromMonthly,
        priceCurrency: "AED",
        unitText: "MONTH",
        referenceQuantity: { "@type": "QuantitativeValue", value: 1, unitCode: "MON" },
      },
      description: "Monthly content packages, starting price",
    },
    "property-shoots": property && {
      "@type": "Offer",
      priceCurrency: "AED",
      price: Math.min(
        ...[...property.apartment.sizes, ...property.villa.sizes].map((s) => s.photo),
        ...property.commercial.tiers.map((t) => t.photo),
      ),
      description: "Property photography, starting price",
    },
    "post-production": other && {
      "@type": "Offer",
      priceCurrency: "USD",
      price: Math.min(...other.postProduction.rates.map((r) => r.amount)),
      description: "Photo edits, starting price per image",
    },
  };
  const types: Record<string, string> = {
    production: "Content production",
    "property-shoots": "Real estate photography and videography",
    "post-production": "Photo and video editing",
    "ai-avatars": "AI avatar video production",
  };
  return {
    "@context": "https://schema.org",
    "@type": "Service",
    "@id": `${abs(p.path)}#service`,
    name: p.name,
    serviceType: types[key],
    description: p.description,
    url: abs(p.path),
    provider: { "@id": BUSINESS_ID },
    areaServed:
      key === "post-production" || key === "ai-avatars"
        ? "Worldwide"
        : { "@type": "City", name: "Dubai" },
    ...(offers[key]
      ? { offers: { ...offers[key], url: abs(p.path), availability: "https://schema.org/InStock" } }
      : {}),
  };
}

/** Home › … › this page. */
export function breadcrumbLd(trail: { name: string; path: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: trail.map((t, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: t.name,
      item: abs(t.path),
    })),
  };
}

export function trailFor(page: SeoPage, extra?: { name: string; path: string }) {
  const trail = [{ name: "Home", path: "/" }];
  const parent = page.parent ? seoPage(page.parent) : undefined;
  if (parent) trail.push({ name: parent.name, path: parent.path });
  if (page.key !== "home") trail.push({ name: page.name, path: page.path });
  if (extra) trail.push(extra);
  return trail;
}
