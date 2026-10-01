import { getOtherPricing, getPropertyPricing } from "@/lib/data";
import { seoPage } from "@/lib/seo/pages";
import { breadcrumbLd, serviceLd, trailFor } from "@/lib/seo/schema";

/** A JSON-LD block. `<` is escaped so content can never close the script tag. */
export function JsonLd({ data }: { data: object }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }}
    />
  );
}

/** Per page: BreadcrumbList (not on Home), and Service on the four service pages. */
export async function PageLd({
  page,
  extra,
}: {
  page: string;
  extra?: { name: string; path: string };
}) {
  const p = seoPage(page)!;
  const isService = ["production", "property-shoots", "post-production", "ai-avatars"].includes(
    page,
  );
  const prices = isService
    ? { property: await getPropertyPricing(), other: await getOtherPricing() }
    : null;
  return (
    <>
      {(page !== "home" || extra) && <JsonLd data={breadcrumbLd(trailFor(p, extra))} />}
      {prices && <JsonLd data={serviceLd(page, prices)} />}
    </>
  );
}
