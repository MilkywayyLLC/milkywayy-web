import Link from "next/link";

const TABS = [
  ["/admin/pricing", "Website prices"],
  ["/admin/pricing/other", "Other website prices"],
  ["/admin/billing/rates", "Portal rate card"],
  ["/admin/billing/packages", "Packages"],
] as const;

/**
 * Money → Prices & packages (admin redesign, 27 Oct 2026): the website price docs and the portal's
 * rate card and packages, side by side. Website prices also set the property-photo defaults on
 * client price lists; the rate card sets the rest.
 */
export function PricesNav({ current }: { current: string }) {
  return (
    <nav className="ad-tabs" aria-label="Prices and packages">
      {TABS.map(([href, label]) => (
        <Link
          key={href}
          href={href}
          prefetch={false}
          aria-current={href === current ? "page" : undefined}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}
