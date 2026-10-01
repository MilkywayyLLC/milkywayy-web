"use client";

import { AppLink as Link } from "@/components/ui/AppLink";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ButtonLink } from "@/components/ui/Button";
import { CloseIcon, MenuIcon, WhatsAppIcon } from "@/components/ui/Icons";
import { env } from "@/lib/env";
import { MENU_OPEN_EVENT } from "@/lib/events";
import { isCurrent, mainNav, pageNameFor } from "@/lib/pages";
import { pageWhatsappLink } from "@/lib/whatsapp";
import { Logo } from "./Logo";

/**
 * Sticky header in the page's tone (it sits inside the [data-tone] wrapper). Under 1020px the nav
 * collapses to logo + Get a quote + menu, which opens a full-screen menu (guide §5).
 *
 * While the menu is open: page scroll is locked, every fixed bottom bar is hidden
 * (html[data-menu-open] in CSS) and the header is lifted above everything. Following a link unlocks
 * scroll first, so the next page can open at the top (see ScrollManager).
 */
export function Header({
  path: pathProp,
  sticky = true,
  whatsapp,
}: {
  path?: string;
  sticky?: boolean;
  /** Business chat number from Site settings. */
  whatsapp: string;
}) {
  const pathname = usePathname();
  const path = pathProp ?? pathname;
  const [open, setOpen] = useState(false);
  const menuBtn = useRef<HTMLButtonElement>(null);
  const closeBtn = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    closeBtn.current?.focus();
    const root = document.documentElement;
    document.body.style.overflow = "hidden";
    root.dataset.menuOpen = "";
    window.dispatchEvent(new Event(MENU_OPEN_EVENT));
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      menuBtn.current?.focus();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      delete root.dataset.menuOpen;
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  /** Leave the menu for another page: unlock scroll now, before the route changes. */
  const leave = () => {
    document.body.style.overflow = "";
    delete document.documentElement.dataset.menuOpen;
    setOpen(false);
  };

  const wa = pageWhatsappLink(pageNameFor(path), whatsapp);

  return (
    <header
      className={[sticky ? "hdr" : "hdr hdr-static", open && "menu-open"].filter(Boolean).join(" ")}
    >
      <div className="w hdr-in">
        <Logo />
        <nav className="nav" aria-label="Main">
          {mainNav.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              aria-current={isCurrent(path, n.href) ? "page" : undefined}
            >
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="hdr-r">
          <a className="login" href={env.clientLoginUrl}>
            Client login
          </a>
          <a
            className="icon-btn wa-h"
            href={wa}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="WhatsApp us"
          >
            <WhatsAppIcon />
          </a>
          <ButtonLink href="/contact" size="sm">
            Get a quote
          </ButtonLink>
          <button
            ref={menuBtn}
            className="icon-btn menu-btn"
            type="button"
            aria-label="Open menu"
            aria-expanded={open}
            aria-controls="mobile-menu"
            onClick={() => setOpen(true)}
          >
            <MenuIcon />
          </button>
        </div>
      </div>

      {open && (
        <div className="mnav" id="mobile-menu" role="dialog" aria-modal="true" aria-label="Menu">
          <div className="top">
            <Logo onClick={leave} />
            <button
              ref={closeBtn}
              className="icon-btn"
              type="button"
              aria-label="Close menu"
              onClick={() => {
                setOpen(false);
                menuBtn.current?.focus();
              }}
            >
              <CloseIcon />
            </button>
          </div>
          {mainNav.map((n) => (
            <Link
              key={n.href}
              className="item"
              href={n.href}
              aria-current={isCurrent(path, n.href) ? "page" : undefined}
              onClick={leave}
            >
              {n.label}
            </Link>
          ))}
          <div className="mnav-actions">
            <a
              className="icon-btn"
              href={wa}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="WhatsApp us"
            >
              <WhatsAppIcon size={20} />
            </a>
            <ButtonLink href="/contact" onClick={leave}>
              Get a quote
            </ButtonLink>
            <ButtonLink href={env.clientLoginUrl} variant="ghost">
              Client login
            </ButtonLink>
          </div>
        </div>
      )}
    </header>
  );
}
