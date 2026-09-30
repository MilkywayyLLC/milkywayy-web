"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ButtonLink } from "@/components/ui/Button";
import { CloseIcon, MenuIcon, WhatsAppIcon } from "@/components/ui/Icons";
import { env } from "@/lib/env";
import { isCurrent, mainNav, mobileNav, pageNameFor, productionMenu } from "@/lib/pages";
import { pageWhatsappLink } from "@/lib/whatsapp";
import { Logo } from "./Logo";

/**
 * Sticky header in the page's tone (it sits inside the [data-tone] wrapper). Under 1020px the nav
 * collapses to logo + Get a quote + menu, which opens a full-screen menu (guide §5).
 */
export function Header({ path: pathProp, sticky = true }: { path?: string; sticky?: boolean }) {
  const pathname = usePathname();
  const path = pathProp ?? pathname;
  const [open, setOpen] = useState(false);
  const menuBtn = useRef<HTMLButtonElement>(null);
  const closeBtn = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    closeBtn.current?.focus();
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function close() {
    setOpen(false);
    menuBtn.current?.focus();
  }

  const wa = pageWhatsappLink(pageNameFor(path));

  return (
    <header className={sticky ? "hdr" : "hdr hdr-static"}>
      <div className="w hdr-in">
        <Logo />
        <nav className="nav" aria-label="Main">
          {mainNav.map((n) =>
            n.href === "/production" ? (
              <ProductionMenu key={n.href} path={path} current={isCurrent(path, n.match)} />
            ) : (
              <Link
                key={n.href}
                href={n.href}
                aria-current={isCurrent(path, n.match) ? "page" : undefined}
              >
                {n.label}
              </Link>
            ),
          )}
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
            <Logo onClick={() => setOpen(false)} />
            <button
              ref={closeBtn}
              className="icon-btn"
              type="button"
              aria-label="Close menu"
              onClick={close}
            >
              <CloseIcon />
            </button>
          </div>
          {mobileNav.map((n) => (
            <Link
              key={n.href}
              className="item"
              href={n.href}
              aria-current={path === n.href ? "page" : undefined}
              onClick={() => setOpen(false)}
            >
              {n.label}
            </Link>
          ))}
          <div className="ctas" style={{ marginTop: 20 }}>
            <ButtonLink href="/contact" onClick={() => setOpen(false)}>
              Get a quote
            </ButtonLink>
            <ButtonLink href={env.clientLoginUrl} variant="ghost">
              Client login
            </ButtonLink>
            <ButtonLink href={wa} variant="ghost">
              <WhatsAppIcon /> WhatsApp
            </ButtonLink>
          </div>
        </div>
      )}
    </header>
  );
}

/**
 * "Production" with a dropdown (Monthly packages, Property shoots, Book a shoot). The link still
 * goes to /production; the chevron button opens the menu for keyboard and touch, hover opens it
 * for mouse. Escape or a click outside closes it.
 */
function ProductionMenu({ path, current }: { path: string; current: boolean }) {
  const [open, setOpen] = useState(false);
  // After Escape or choosing a page, ignore hover until the pointer leaves, so the menu really closes.
  const [suppressHover, setSuppressHover] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        setSuppressHover(true);
        btn.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div
      className="nav-dd"
      ref={wrap}
      data-open={open || undefined}
      data-no-hover={suppressHover || undefined}
      onPointerLeave={() => setSuppressHover(false)}
    >
      <Link href="/production" aria-current={current ? "page" : undefined}>
        Production
      </Link>
      <button
        ref={btn}
        type="button"
        className="dd-btn"
        aria-expanded={open}
        aria-controls="production-menu"
        aria-label="Production pages"
        onClick={() => setOpen((v) => !v)}
      >
        ▾
      </button>
      <div className="nav-menu" id="production-menu">
        <ul>
          {productionMenu.map((m) => (
            <li key={m.href}>
              <Link
                href={m.href}
                aria-current={path === m.href ? "page" : undefined}
                onClick={() => {
                  setOpen(false);
                  setSuppressHover(true);
                }}
              >
                {m.label}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
