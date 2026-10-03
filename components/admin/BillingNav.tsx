import Link from "next/link";

const TABS = [
  ["/admin/billing", "Invoices"],
  ["/admin/billing/rates", "Rate card"],
  ["/admin/billing/packages", "Packages"],
  ["/admin/billing/suggestions", "Suggestions"],
] as const;

/** Admin → Billing sections (CLIENT_PORTAL_GUIDE §7.3). */
export function BillingNav({ current }: { current: string }) {
  return (
    <nav className="ad-btns" aria-label="Billing sections">
      {TABS.map(([href, label]) => (
        <Link
          key={href}
          href={href}
          prefetch={false}
          className={href === current ? "ad-btn small" : "ad-btn small ghost"}
          aria-current={href === current ? "page" : undefined}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}
