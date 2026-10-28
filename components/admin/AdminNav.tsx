"use client";

import { BrandLogo } from "@/components/layout/Logo";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { signOut } from "@/lib/admin/auth-actions";

type Item = { href: string; label: string; owner?: boolean; also?: string[] };
type Entry = Item | { title: string; owner?: boolean; collapsed?: boolean; items: Item[] };

/**
 * Admin redesign (27 Oct 2026): 8 top-level entries by job. Routes are unchanged; `also` marks the
 * sub-pages that light an entry up. Website starts collapsed (it opens on its own pages).
 */
const NAV: Entry[] = [
  { href: "/admin", label: "Today" },
  { href: "/admin/projects", label: "Projects", owner: true },
  { href: "/admin/inquiries", label: "Messages", owner: true },
  {
    href: "/admin/accounts",
    label: "Clients",
    owner: true,
    also: ["/admin/characters", "/admin/listings"],
  },
  { href: "/admin/leads", label: "Leads", owner: true },
  {
    title: "Money",
    owner: true,
    items: [
      { href: "/admin/billing", label: "Invoices", also: ["/admin/billing/invoices"] },
      {
        href: "/admin/billing/rates",
        label: "Prices & packages",
        also: ["/admin/billing/packages", "/admin/pricing"],
      },
      { href: "/admin/billing/package-requests", label: "Package requests" },
      { href: "/admin/billing/refunds", label: "Refunds" },
    ],
  },
  {
    title: "Website",
    collapsed: true,
    items: [
      { href: "/admin/library", label: "Library", also: ["/admin/portfolio"] },
      { href: "/admin/pages", label: "Pages" },
      { href: "/admin/case-studies", label: "Case studies" },
      { href: "/admin/before-after", label: "Before / after" },
      { href: "/admin/avatars", label: "Avatars", also: ["/admin/avatar-hero"] },
      { href: "/admin/reviews", label: "Reviews" },
      { href: "/admin/faqs", label: "FAQs" },
      { href: "/admin/stats", label: "Stats" },
      { href: "/admin/clients", label: "Client logos" },
      { href: "/admin/seo", label: "SEO" },
    ],
  },
  {
    title: "Settings",
    owner: true,
    items: [
      { href: "/admin/billing/settings", label: "Business & billing" },
      { href: "/admin/operations", label: "Operations" },
      { href: "/admin/settings", label: "Site settings" },
      { href: "/admin/admins", label: "Admins" },
      { href: "/admin/billing/suggestions", label: "Advanced" },
    ],
  },
];

const under = (path: string, href: string) => path === href || path.startsWith(`${href}/`);
/** The billing sub-pages have their own entries, so Invoices doesn't claim them. */
const BILLING_OWN = [
  "rates",
  "packages",
  "package-requests",
  "refunds",
  "settings",
  "suggestions",
].map((x) => `/admin/billing/${x}`);
const current = (path: string, i: Item) =>
  i.href === "/admin"
    ? path === "/admin"
    : i.href === "/admin/billing"
      ? (path === i.href || under(path, "/admin/billing/invoices")) &&
        !BILLING_OWN.some((b) => under(path, b))
      : under(path, i.href) || !!i.also?.some((h) => under(path, h));

/** Sidebar on desktop; a full-screen menu behind the Menu button on phones. */
export function AdminNav({ role, email }: { role: "owner" | "editor"; email: string }) {
  const path = usePathname();
  // The menu belongs to the page it was opened on, so navigating closes it.
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === path;
  useEffect(() => {
    document.documentElement.style.overflow = open ? "hidden" : "";
  }, [open]);

  return (
    <>
      <header className="ad-top">
        <Link className="ad-brand" href="/admin" aria-label="Milkywayy admin">
          <BrandLogo tone="light" />
          <small>Admin</small>
        </Link>
        <button
          type="button"
          className="ad-btn quiet small ad-top-menu"
          aria-expanded={open}
          aria-controls="ad-side"
          onClick={() => setOpenOn(open ? null : path)}
        >
          {open ? "Close" : "Menu"}
        </button>
      </header>
      <aside id="ad-side" className="ad-side" data-open={open} aria-label="Admin sections">
        <nav className="ad-nav">
          {NAV.map((e) => {
            if (e.owner && role !== "owner") return null;
            if ("href" in e) return <NavLink key={e.href} i={e} path={path} />;
            const items = e.items.filter((i) => !i.owner || role === "owner");
            if (!items.length) return null;
            const active = items.some((i) => current(path, i));
            return (
              <details
                className="ad-nav-group"
                key={e.title}
                open={!e.collapsed || active || undefined}
              >
                <summary className="ad-eb">{e.title}</summary>
                {items.map((i) => (
                  <NavLink key={i.href} i={i} path={path} />
                ))}
              </details>
            );
          })}
          <div className="ad-nav-foot">
            <span className="ad-small ad-muted">
              {email} · {role === "owner" ? "Owner" : "Editor"}
            </span>
            <a className="ad-btn quiet small" href="/" target="_blank" rel="noopener">
              Open the site ↗
            </a>
            <form action={signOut}>
              <button className="ad-btn quiet small" type="submit" style={{ width: "100%" }}>
                Sign out
              </button>
            </form>
          </div>
        </nav>
      </aside>
    </>
  );
}

function NavLink({ i, path }: { i: Item; path: string }) {
  return (
    <Link href={i.href} prefetch={false} aria-current={current(path, i) ? "page" : undefined}>
      {i.label}
    </Link>
  );
}
