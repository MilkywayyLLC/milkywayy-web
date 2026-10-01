import { pageNames } from "@/lib/pages";

/** Public paths the admin can preview. Anything else falls back to Home (no open redirects). */
export function safePreviewPath(path: string | null | undefined): string {
  if (!path) return "/";
  const [pathname, hash = ""] = path.split("#");
  const ok =
    pathname in pageNames ||
    pathname === "/privacy" ||
    pathname === "/terms" ||
    /^\/work\/[a-z0-9-]+$/.test(pathname);
  return ok ? pathname + (/^[\w-]*$/.test(hash) && hash ? `#${hash}` : "") : "/";
}
