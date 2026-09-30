"use client";

import { useEffect } from "react";

const GAP = 16;

/** Height of whatever is stuck to the top (the sticky header), so targets land below it. */
function headerOffset() {
  const hdr = document.querySelector<HTMLElement>(".hdr:not(.hdr-static)");
  return (hdr?.getBoundingClientRect().height ?? 0) + GAP;
}

function scrollToId(id: string, smooth: boolean) {
  const el = document.getElementById(id);
  if (!el) return false;
  const top = Math.max(0, el.getBoundingClientRect().top + window.scrollY - headerOffset());
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  window.scrollTo({ top, behavior: smooth && !reduce ? "smooth" : "instant" });

  // Smooth scrolling can stall (throttled or backgrounded tabs); make sure we arrive.
  window.setTimeout(() => {
    if (Math.abs(window.scrollY - top) > 4) window.scrollTo({ top, behavior: "instant" });
  }, 900);

  // Move keyboard focus to the target so the next Tab continues from there.
  if (!el.hasAttribute("tabindex")) el.setAttribute("tabindex", "-1");
  el.focus({ preventScroll: true });
  return true;
}

/**
 * Same-page anchor links ("See packages ↓", "Price my shoot", "Book a free test"): smooth scroll
 * to the target, offset for the sticky header, and update the hash. Also corrects the position
 * when a page is opened with a hash. CSS `scroll-padding-top` covers the no-JS case.
 */
export function AnchorScroll() {
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey)
        return;
      const a = (e.target as Element | null)?.closest?.("a[href*='#']");
      if (!(a instanceof HTMLAnchorElement) || a.target === "_blank") return;
      const url = new URL(a.href, window.location.href);
      if (url.origin !== window.location.origin || url.pathname !== window.location.pathname)
        return;
      const id = decodeURIComponent(url.hash.slice(1));
      if (!id || !scrollToId(id, true)) return;
      e.preventDefault();
      if (window.location.hash !== url.hash) history.pushState(history.state, "", url.hash);
    };
    // Capture phase so this runs before next/link and native hash navigation.
    document.addEventListener("click", onClick, true);

    if (window.location.hash) {
      const id = decodeURIComponent(window.location.hash.slice(1));
      window.requestAnimationFrame(() => scrollToId(id, false));
    }
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  return null;
}
