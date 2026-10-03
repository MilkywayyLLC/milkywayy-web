"use client";

import { BrandLogo } from "@/components/layout/Logo";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, useTransition, type ReactNode } from "react";
import { switchAccount } from "@/lib/portal/account-actions";
import { signOut } from "@/lib/portal/actions";
import type { Tab } from "@/lib/portal/shell";
import { Icon } from "./Icon";

type AccountChoice = { id: string; name: string; role: string };

const isOn = (path: string, href: string) =>
  href === "/portal" ? path === "/portal" : path === href || path.startsWith(`${href}/`);

const ROLE: Record<string, string> = { owner: "Owner", admin: "Admin", member: "Member" };

/**
 * The portal frame from the approved mockup (CLIENT_PORTAL_GUIDE §5.1): a rail of tabs on
 * desktop; on phones a bottom bar with 4 tabs and the rest under More. Top right: account
 * switcher (when someone belongs to several), plan badge and the avatar menu.
 */
export function Shell({
  main,
  account,
  accounts,
  currentId,
  plan,
  me,
  children,
}: {
  main: Tab[];
  account: Tab[];
  accounts: AccountChoice[];
  currentId: string;
  plan: string;
  me: { name: string; initials: string };
  children: ReactNode;
}) {
  const path = usePathname();
  const [more, setMore] = useState(false);
  const [menu, setMenu] = useState<null | "account" | "me">(null);
  const [switching, startSwitch] = useTransition();
  const current = accounts.find((a) => a.id === currentId)!;
  const bottom = main.slice(0, 4);
  const rest = [...main, ...account].filter((t) => !bottom.includes(t));

  // Menus close on navigation and on Escape.
  const [openedOn, setOpenedOn] = useState(path);
  if (openedOn !== path) {
    setOpenedOn(path);
    setMenu(null);
    setMore(false);
  }
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMenu(null);
        setMore(false);
      }
    };
    addEventListener("keydown", k);
    return () => removeEventListener("keydown", k);
  }, []);

  return (
    <div className="pt-shell">
      <aside className="pt-rail" aria-label="Portal">
        <Link href="/portal" className="pt-logo">
          <BrandLogo tone="light" />
        </Link>
        <nav className="pt-rail-nav" aria-label="Portal sections">
          {main.map((t) => (
            <Link key={t.href} href={t.href} aria-current={isOn(path, t.href) ? "page" : undefined}>
              <Icon name={t.icon} /> {t.label}
            </Link>
          ))}
          <span className="pt-rail-sep" />
          {account.map((t) => (
            <Link key={t.href} href={t.href} aria-current={isOn(path, t.href) ? "page" : undefined}>
              <Icon name={t.icon} /> {t.label}
            </Link>
          ))}
        </nav>
      </aside>

      <div className="pt-main">
        <header className="pt-top">
          <Link href="/portal" className="pt-logo pt-logo-sm">
            <BrandLogo tone="light" />
          </Link>
          <div className="pt-top-right">
            {accounts.length > 1 ? (
              <div className="pt-pop-wrap">
                <button
                  type="button"
                  className="pt-switch"
                  aria-haspopup="menu"
                  aria-expanded={menu === "account"}
                  aria-label={`Account: ${current.name}. Switch account`}
                  onClick={() => setMenu(menu === "account" ? null : "account")}
                >
                  <span className="pt-switch-name">{switching ? "Switching…" : current.name}</span>
                  <Icon name="chevron" size={14} />
                </button>
                {menu === "account" && (
                  <div className="pt-pop" role="menu">
                    <span className="pt-eb">Your accounts</span>
                    {accounts.map((a) => (
                      <button
                        key={a.id}
                        type="button"
                        role="menuitemradio"
                        aria-checked={a.id === currentId}
                        className={a.id === currentId ? "on" : undefined}
                        onClick={() => {
                          setMenu(null);
                          if (a.id !== currentId) startSwitch(() => switchAccount(a.id));
                        }}
                      >
                        {a.name}
                        <small>{ROLE[a.role] ?? a.role}</small>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <span className="pt-switch" style={{ cursor: "default" }}>
                <span className="pt-switch-name">{current.name}</span>
              </span>
            )}
            <span className="pt-plan" title="Your plan">
              {plan}
            </span>
            <div className="pt-pop-wrap">
              <button
                type="button"
                className="pt-avatar"
                aria-label={`${me.name}: profile menu`}
                aria-haspopup="menu"
                aria-expanded={menu === "me"}
                onClick={() => setMenu(menu === "me" ? null : "me")}
              >
                {me.initials}
              </button>
              {menu === "me" && (
                <div className="pt-pop pt-pop-right" role="menu">
                  <span className="pt-eb">{me.name}</span>
                  <Link role="menuitem" href="/portal/settings">
                    Settings
                  </Link>
                  <Link role="menuitem" href="/">
                    milkywayy.com
                  </Link>
                  <form action={signOut}>
                    <button type="submit" role="menuitem" style={{ width: "100%" }}>
                      Sign out
                    </button>
                  </form>
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
              <Link key={t.href} href={t.href} className="pt-more-row">
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
