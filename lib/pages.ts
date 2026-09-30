/** Page names used in WhatsApp messages ("I came from the {page} page.") and nav state. */
export const pageNames: Record<string, string> = {
  "/": "Home",
  "/production": "Production",
  "/production/property-shoots": "Property shoots",
  "/book": "Booking",
  "/post-production": "Post-production",
  "/post-production/free-test": "Free test",
  "/ai-avatars": "AI avatars",
  "/work": "Work",
  "/about": "About",
  "/contact": "Contact",
};

export const pageNameFor = (path: string) => pageNames[path] ?? "website";

export const mainNav = [
  { href: "/production", label: "Production", match: ["/production", "/book"] },
  { href: "/post-production", label: "Post-production", match: ["/post-production"] },
  { href: "/ai-avatars", label: "AI avatars", match: ["/ai-avatars"] },
  { href: "/work", label: "Work", match: ["/work"] },
  { href: "/about", label: "About", match: ["/about"] },
] as const;

export const mobileNav = [
  { href: "/production", label: "Production" },
  { href: "/production/property-shoots", label: "Property shoots" },
  { href: "/post-production", label: "Post-production" },
  { href: "/ai-avatars", label: "AI avatars" },
  { href: "/contact", label: "Contact" },
] as const;

export const isCurrent = (path: string, match: readonly string[]) =>
  match.some((m) => path === m || path.startsWith(`${m}/`));

/** Mobile action bar: the page's main action (guide §5). Hash targets are sections on that page. */
export const mobileActions: Record<string, { label: string; href: string }> = {
  "/": { label: "Get a quote", href: "/contact" },
  "/production": { label: "Get your package", href: "#get-your-package" },
  "/production/property-shoots": { label: "Price my shoot", href: "#build-your-booking" },
  "/book": { label: "Price my shoot", href: "#build-your-booking" },
  "/post-production": { label: "Book a free test", href: "#free-test" },
  "/post-production/free-test": { label: "Book a free test", href: "#free-test" },
  "/ai-avatars": { label: "Book a demo", href: "#demo" },
  "/contact": { label: "Send request", href: "#contact-form" },
};

export const mobileActionFor = (path: string) =>
  mobileActions[path] ?? { label: "Get a quote", href: "/contact" };
