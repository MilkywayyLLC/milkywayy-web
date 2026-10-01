"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { Icon } from "./Icon";
import { usePersona } from "./persona";

const B = "/portal-preview";
type Tab = { href: string; label: string; icon: string };

/** Tabs for this account: services it uses, plus Listings for delivered shoots (guide §5.1). */
export function useTabs() {
  const { account } = usePersona();
  const s = account.services;
  const main: Tab[] = [
    { href: `${B}/home`, label: "Home", icon: "home" },
    ...(s.includes("shoots") ? [{ href: `${B}/shoots`, label: "Shoots", icon: "shoots" }] : []),
    ...(s.includes("editing") ? [{ href: `${B}/editing`, label: "Editing", icon: "editing" }] : []),
    ...(s.includes("avatars") ? [{ href: `${B}/avatars`, label: "Avatars", icon: "avatars" }] : []),
    ...(s.includes("shoots")
      ? [{ href: `${B}/listings`, label: "Listings", icon: "listings" }]
      : []),
    { href: `${B}/billing`, label: "Billing", icon: "billing" },
  ];
  const account_: Tab[] = [
    { href: `${B}/team`, label: "Team", icon: "team" },
    { href: `${B}/contacts`, label: "Contacts", icon: "contacts" },
    { href: `${B}/settings`, label: "Settings", icon: "settings" },
  ];
  return { main, account: account_ };
}

const isOn = (path: string, href: string) => path === href || path.startsWith(`${href}/`);

export function Shell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const { account } = usePersona();
  const tabs = useTabs();
  const [more, setMore] = useState(false);
  const [menu, setMenu] = useState<null | "account" | "me">(null);
  // Phone: 4 tabs at most; the rest under More.
  const all = [...tabs.main, ...tabs.account];
  const bottom = tabs.main.slice(0, 4);
  const rest = all.filter((t) => !bottom.includes(t));
  const plan = account.plan.mode === "package" ? `Monthly: ${account.plan.name}` : "Pay as you go";

  return (
    <div className="pt-shell">
      <aside className="pt-rail" aria-label="Portal">
        <Link href={`${B}/home`} className="pt-logo">
          <i className="rec-dot" aria-hidden="true" /> MILKYWAYY
        </Link>
        <nav className="pt-rail-nav">
          {tabs.main.map((t) => (
            <Link key={t.href} href={t.href} aria-current={isOn(path, t.href) ? "page" : undefined}>
              <Icon name={t.icon} /> {t.label}
            </Link>
          ))}
          <span className="pt-rail-sep" />
          {tabs.account.map((t) => (
            <Link key={t.href} href={t.href} aria-current={isOn(path, t.href) ? "page" : undefined}>
              <Icon name={t.icon} /> {t.label}
            </Link>
          ))}
        </nav>
      </aside>

      <div className="pt-main">
        <header className="pt-top">
          <Link href={`${B}/home`} className="pt-logo pt-logo-sm">
            <i className="rec-dot" aria-hidden="true" /> MILKYWAYY
          </Link>
          <div className="pt-top-right">
            <div className="pt-pop-wrap">
              <button
                type="button"
                className="pt-switch"
                aria-expanded={menu === "account"}
                onClick={() => setMenu(menu === "account" ? null : "account")}
              >
                <span className="pt-switch-name">{account.name}</span>
                <Icon name="chevron" size={14} />
              </button>
              {menu === "account" && (
                <div className="pt-pop" role="menu">
                  <span className="pt-eb">Your accounts</span>
                  <button type="button" role="menuitem" className="on">
                    {account.name}
                    <small>{account.me.role}</small>
                  </button>
                  <button type="button" role="menuitem" onClick={() => setMenu(null)}>
                    {account.id === "all" ? "Rania Haddad (personal)" : "Harbourline Properties"}
                    <small>Member</small>
                  </button>
                </div>
              )}
            </div>
            <span className="pt-plan" title="Your plan">
              {plan}
            </span>
            <div className="pt-pop-wrap">
              <button
                type="button"
                className="pt-avatar"
                aria-label="Your profile"
                aria-expanded={menu === "me"}
                onClick={() => setMenu(menu === "me" ? null : "me")}
              >
                {account.me.initials}
              </button>
              {menu === "me" && (
                <div className="pt-pop pt-pop-right" role="menu">
                  <span className="pt-eb">{account.me.name}</span>
                  <Link role="menuitem" href={`${B}/settings`} onClick={() => setMenu(null)}>
                    Settings
                  </Link>
                  <Link role="menuitem" href="/" onClick={() => setMenu(null)}>
                    milkywayy.com
                  </Link>
                  <Link role="menuitem" href={`${B}/login`}>
                    Sign out
                  </Link>
                </div>
              )}
            </div>
          </div>
        </header>
        <main className="pt-content" id="main" onClick={() => menu && setMenu(null)}>
          {children}
        </main>
      </div>

      <nav className="pt-bottom" aria-label="Portal tabs">
        {bottom.map((t) => (
          <Link key={t.href} href={t.href} aria-current={isOn(path, t.href) ? "page" : undefined}>
            <Icon name={t.icon} />
            <span>{t.label}</span>
          </Link>
        ))}
        {rest.length > 0 && (
          <button
            type="button"
            aria-expanded={more}
            aria-current={rest.some((t) => isOn(path, t.href)) ? "page" : undefined}
            onClick={() => setMore(true)}
          >
            <Icon name="more" />
            <span>More</span>
          </button>
        )}
      </nav>
      {more && (
        <div className="pt-sheet-bg" onClick={() => setMore(false)}>
          <div
            className="pt-sheet"
            role="dialog"
            aria-label="More"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="pt-sheet-head">
              <b>More</b>
              <button
                type="button"
                className="pt-icon-btn"
                aria-label="Close"
                onClick={() => setMore(false)}
              >
                <Icon name="close" />
              </button>
            </div>
            {rest.map((t) => (
              <Link
                key={t.href}
                href={t.href}
                className="pt-more-row"
                onClick={() => setMore(false)}
              >
                <Icon name={t.icon} /> {t.label}
                <Icon name="chevron" size={16} />
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
