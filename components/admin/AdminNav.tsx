"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { signOut } from "@/lib/admin/auth-actions";

type Item = { href: string; label: string; owner?: boolean };
const GROUPS: { title: string; items: Item[] }[] = [
  {
    title: "Workspace",
    items: [
      { href: "/admin", label: "Dashboard" },
      { href: "/admin/leads", label: "Leads", owner: true },
    ],
  },
  {
    title: "Content",
    items: [
      { href: "/admin/portfolio", label: "Portfolio" },
      { href: "/admin/case-studies", label: "Case studies" },
      { href: "/admin/before-after", label: "Before / after" },
      { href: "/admin/avatars", label: "AI avatars" },
      { href: "/admin/reviews", label: "Reviews" },
      { href: "/admin/faqs", label: "FAQs" },
      { href: "/admin/stats", label: "Stats" },
      { href: "/admin/clients", label: "Clients" },
    ],
  },
  {
    title: "Pricing",
    items: [
      { href: "/admin/pricing", label: "Property shoots", owner: true },
      { href: "/admin/pricing/other", label: "Other prices", owner: true },
    ],
  },
  {
    title: "Settings",
    items: [
      { href: "/admin/settings", label: "Site settings", owner: true },
      { href: "/admin/seo", label: "SEO" },
      { href: "/admin/admins", label: "Admins", owner: true },
    ],
  },
];

const current = (path: string, href: string) =>
  href === "/admin"
    ? path === "/admin"
    : href === "/admin/pricing"
      ? path === href
      : path === href ||
        path.startsWith(`${href}/`) ||
        (href === "/admin/avatars" && path === "/admin/avatar-hero");

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
        <Link className="ad-brand" href="/admin">
          Milkywayy<small>Admin</small>
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
          {GROUPS.map((g) => {
            const items = g.items.filter((i) => !i.owner || role === "owner");
            if (!items.length) return null;
            return (
              <div className="ad-nav-group" key={g.title}>
                <span className="ad-eb">{g.title}</span>
                {items.map((i) => (
                  <Link
                    key={i.href}
                    href={i.href}
                    prefetch={false}
                    aria-current={current(path, i.href) ? "page" : undefined}
                  >
                    {i.label}
                  </Link>
                ))}
              </div>
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
