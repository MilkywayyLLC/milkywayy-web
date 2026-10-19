"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect } from "react";

/**
 * Page feedback (owner QA, 3 Oct 2026):
 * - <html data-hydrated> once React is ready; until then buttons look disabled, so a tap React
 *   can't handle yet doesn't look ignored.
 * - <html data-navigating> from the moment an in-app link is clicked until the next page arrives,
 *   so a slow server render never looks like a dead click. (No loading.tsx: that would turn real
 *   404s into 200s.)
 */
export function Hydrated() {
  useEffect(() => {
    const html = document.documentElement;
    html.dataset.hydrated = "1";
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey)
        return;
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin || url.href === location.href || url.hash) return;
      html.dataset.navigating = "1";
      setTimeout(() => delete html.dataset.navigating, 15000);
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);
  return (
    <Suspense fallback={null}>
      <Arrived />
    </Suspense>
  );
}

function Arrived() {
  const path = usePathname();
  const search = useSearchParams();
  useEffect(() => {
    delete document.documentElement.dataset.navigating;
  }, [path, search]);
  return null;
}
