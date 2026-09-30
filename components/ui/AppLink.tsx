"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ComponentProps } from "react";

/**
 * next/link that prefetches on intent (pointer over, touch start, keyboard focus) instead of when
 * the link scrolls into view. Pages stay inside the JS budget (viewport prefetch pulled other
 * pages' code into Home's load) and phones don't download pages nobody opens. Hash-only links
 * behave as before.
 */
export function AppLink({
  href,
  onMouseEnter,
  onTouchStart,
  onFocus,
  ...rest
}: ComponentProps<typeof Link>) {
  const router = useRouter();
  const target = typeof href === "string" ? href : (href.pathname ?? "");
  const prefetch = () => {
    if (target.startsWith("/")) router.prefetch(target);
  };
  return (
    <Link
      href={href}
      prefetch={false}
      onMouseEnter={(e) => {
        prefetch();
        onMouseEnter?.(e);
      }}
      onTouchStart={(e) => {
        prefetch();
        onTouchStart?.(e);
      }}
      onFocus={(e) => {
        prefetch();
        onFocus?.(e);
      }}
      {...rest}
    />
  );
}
