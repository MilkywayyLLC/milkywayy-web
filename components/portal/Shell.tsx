"use client";

import { BrandLogo } from "@/components/layout/Logo";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, useTransition, type ReactNode } from "react";
import { switchAccount } from "@/lib/portal/account-actions";
import { signOut } from "@/lib/portal/actions";
import { chatLink } from "@/lib/portal/billing";
import { initials, type Tab } from "@/lib/portal/shell";
import { Icon } from "./Icon";
import type { RailPlan } from "./PaymentParts";

type AccountChoice = { id: string; name: string; role: string };

const isOn = (path: string, href: string) =>
  href === "/portal" ? path === "/portal" : path === href || path.startsWith(`${href}/`);

const ROLE: Record<string, string> = { owner: "Owner", admin: "Admin", member: "Member" };

/**
 * The portal frame (V2 reskin, 25 Oct 2026): a rail of tabs with the plan card at the bottom on
 * desktop; on phones the same rail as a drawer behind a menu button, and a sticky "Book media"
 * button at the bottom. Top right, one 40px row:
 * "Hello, {first name}", the account menu (package, account switcher, Settings, Team, Sign out)
 * and "Book media" on the far right.
 */
export function Shell({
  main,
  account,
  accounts,
  currentId,
  plan,
  me,
  action,
  unpaid = 0,
  railPlan,
  canBook = false,
  children,
}: {
  main: Tab[];
  account: Tab[];
  accounts: AccountChoice[];
  currentId: string;
  plan: string;
  me: { name: string; first: string };
  /** "Book media", top right on every page (owner, 10 Oct 2026). */
  action?: ReactNode;
  /** Unpaid invoices: a red dot on the bell (billing access only; 24 Oct 2026). */
  unpaid?: number | null;
  /** Bottom left: the package with a thin AED meter, or "Pay per shoot · 100% upfront". */
  railPlan?: RailPlan | null;
  /** Phones: the sticky "Book media" button at the bottom (V2 reskin, 25 Oct 2026). */
  canBook?: boolean;
  children: ReactNode;
}) {
  const path = usePathname();
  const [drawer, setDrawer] = useState(false);
  const [menu, setMenu] = useState<null | "me">(null);
  const [switching, startSwitch] = useTransition();
  const current = accounts.find((a) => a.id === currentId)!;
  const booking = path.startsWith("/portal/book");

  // Menus close on navigation and on Escape.
  const [openedOn, setOpenedOn] = useState(path);
  if (openedOn !== path) {
    setOpenedOn(path);
    setMenu(null);
    setDrawer(false);
  }
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMenu(null);
        setDrawer(false);
      }
    };
    addEventListener("keydown", k);
    return () => removeEventListener("keydown", k);
  }, []);

  return (
    <div className="pt-shell">
      {drawer && <div className="pt-drawer-bg" onClick={() => setDrawer(false)} />}
      <aside className="pt-rail" id="pt-rail" aria-label="Portal" data-open={drawer || undefined}>
        <div className="pt-rail-top">
          <Link href="/portal" className="pt-logo">
            <BrandLogo tone="dark" />
          </Link>
          <button
            type="button"
            className="pt-icon-btn pt-drawer-x"
            aria-label="Close menu"
            onClick={() => setDrawer(false)}
          >
            <Icon name="close" size={18} />
          </button>
        </div>
        <nav className="pt-rail-nav" aria-label="Portal sections">
          <span className="pt-rail-h">Workspace</span>
          {main.map((t) => (
            <Link key={t.href} href={t.href} aria-current={isOn(path, t.href) ? "page" : undefined}>
              <Icon name={t.icon} size={18} /> {t.label}
            </Link>
          ))}
          <span className="pt-rail-h">Account</span>
          {account.map((t) => (
            <Link key={t.href} href={t.href} aria-current={isOn(path, t.href) ? "page" : undefined}>
              <Icon name={t.icon} size={18} /> {t.label}
            </Link>
          ))}
        </nav>
        {railPlan && (
          <Link href="/portal/billing" className="pt-rail-plan" data-testid="rail-plan">
            {railPlan.kind === "package" ? (
              <>
                <span className="pt-rail-plan-k">Your plan</span>
                <b>{railPlan.name}</b>
                <div
                  className="pt-mtr-bar"
                  role="meter"
                  aria-label={`Package used: ${railPlan.text}`}
                  aria-valuemin={0}
                  aria-valuemax={railPlan.total}
                  aria-valuenow={Math.min(railPlan.used + railPlan.booked, railPlan.total)}
                >
                  <div
                    className="pt-mtr-done"
                    style={{
                      width: `${Math.min(100, (railPlan.used / Math.max(1, railPlan.total)) * 100)}%`,
                    }}
                  />
                  <div
                    className="pt-mtr-booked"
                    style={{
                      width: `${Math.min(100, (railPlan.booked / Math.max(1, railPlan.total)) * 100)}%`,
                    }}
                  />
                </div>
                <span>{railPlan.text}</span>
              </>
            ) : (
              <>
                <span className="pt-rail-plan-k">
                  {railPlan.upcoming ? "Your plan" : "How you pay"}
                </span>
                <b>{railPlan.upcoming ?? railPlan.text}</b>
                {railPlan.upcoming && <span>{railPlan.text}</span>}
              </>
            )}
          </Link>
        )}
      </aside>

      <div className="pt-main">
        <header className="pt-top">
          <div className="pt-top-left">
            <button
              type="button"
              className="pt-icon-btn pt-burger"
              aria-label="Open menu"
              aria-expanded={drawer}
              aria-controls="pt-rail"
              onClick={() => setDrawer(true)}
            >
              <Icon name="menu" size={20} />
            </button>
            <Link href="/portal" className="pt-logo pt-logo-sm">
              <BrandLogo tone="dark" />
            </Link>
          </div>
          <div className="pt-top-right">
            {me.first && <span className="pt-hello">Hello, {me.first}</span>}
            {unpaid != null && (
              <Link
                href="/portal/billing"
                className="pt-acct pt-bell"
                aria-label={
                  unpaid
                    ? `${unpaid} unpaid invoice${unpaid === 1 ? "" : "s"}`
                    : "Billing: nothing to pay"
                }
                data-testid="bell"
              >
                <Icon name="bell" size={20} />
                {unpaid > 0 && <i className="pt-dot" aria-hidden="true" />}
              </Link>
            )}
            <div className="pt-pop-wrap">
              <button
                type="button"
                className="pt-acct"
                aria-label={`${me.name}: account menu`}
                aria-haspopup="menu"
                aria-expanded={menu === "me"}
                onClick={() => setMenu(menu === "me" ? null : "me")}
              >
                <span className="pt-initials">{initials(me.name)}</span>
              </button>
              <div
                className="pt-pop pt-pop-right"
                role="menu"
                data-open={menu === "me" || undefined}
                inert={menu !== "me"}
              >
                <div className="pt-pop-who">
                  <b>{me.name}</b>
                  <span className="pt-switch-name">{switching ? "Switching…" : current.name}</span>
                  {plan && (
                    <span className="pt-plan" title="Your package">
                      {plan}
                    </span>
                  )}
                </div>
                {accounts.length > 1 && (
                  <>
                    <span className="pt-eb">Switch account</span>
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
                    <span className="pt-pop-sep" />
                  </>
                )}
                <Link role="menuitem" href="/portal/settings">
                  Settings
                </Link>
                {account.some((t) => t.href === "/portal/people") && (
                  <Link role="menuitem" href="/portal/people">
                    People
                  </Link>
                )}
                <form action={signOut}>
                  <button type="submit" role="menuitem" style={{ width: "100%" }}>
                    Sign out
                  </button>
                </form>
              </div>
            </div>
            <span className="pt-top-book">{action}</span>
          </div>
        </header>
        <main className="pt-content" id="main" onClick={() => menu && setMenu(null)}>
          {children}
        </main>
        {/* On every page (owner, 25 Oct 2026); replaces the full-width WhatsApp bar. */}
        <footer className="pt-foot" data-testid="portal-footer">
          <a href="https://milkywayy.com" target="_blank" rel="noopener">
            milkywayy.com
          </a>
          <a href={chatLink("Hi Milkywayy")} target="_blank" rel="noopener noreferrer">
            WhatsApp
          </a>
          <a href="/terms" target="_blank" rel="noopener">
            Terms
          </a>
        </footer>
      </div>

      {canBook && !booking && (
        <div className="pt-bookbar">
          <Link href="/portal/book" className="btn btn-p">
            <Icon name="plus" size={16} /> Book media
          </Link>
        </div>
      )}
    </div>
  );
}
