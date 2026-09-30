/** Page names used in WhatsApp messages ("I came from the {page} page.") and nav state. */
export const pageNames: Record<string, string> = {
  "/": "Home",
  "/production": "Production",
  "/property-shoots": "Property shoots",
  "/post-production": "Post-production",
  "/post-production/free-test": "Free test",
  "/ai-avatars": "AI avatars",
  "/work": "Work",
  "/about": "About",
  "/contact": "Contact",
};

export const pageNameFor = (path: string) => pageNames[path] ?? "website";

/** Main navigation, the same on desktop and in the mobile menu (owner, 1 Oct 2026). */
export const mainNav = [
  { href: "/production", label: "Production" },
  { href: "/property-shoots", label: "Property shoots" },
  { href: "/post-production", label: "Post-production" },
  { href: "/ai-avatars", label: "AI avatars" },
  { href: "/work", label: "Work" },
  { href: "/about", label: "About" },
] as const;

export const isCurrent = (path: string, href: string) =>
  path === href || path.startsWith(`${href}/`);

/** Mobile action bar: the page's main action (guide §5). Hash targets are sections on that page. */
export const mobileActions: Record<string, { label: string; href: string }> = {
  "/": { label: "Get a quote", href: "/contact" },
  "/production": { label: "Get your package", href: "#get-your-package" },
  "/post-production": { label: "Book a free test", href: "#free-test" },
  "/post-production/free-test": { label: "Book a free test", href: "#free-test" },
  "/ai-avatars": { label: "Book a demo", href: "#demo" },
  "/contact": { label: "Send request", href: "#contact-form" },
};

/** /property-shoots has its own bottom bar (booking total + Review & send) instead of the action bar. */
export const hasOwnMobileBar = (path: string) => path === "/property-shoots";

export const mobileActionFor = (path: string) =>
  mobileActions[path] ?? { label: "Get a quote", href: "/contact" };
