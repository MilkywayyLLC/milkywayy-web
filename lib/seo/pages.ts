/**
 * Every public page's search and share defaults (guide §12). The admin's SEO section can
 * override title, description and share image per page (table seo_pages, keyed by `key`).
 * `og` is the two-line headline on the page's share image.
 */
export interface SeoPage {
  key: string;
  path: string;
  /** Full <title> (not templated). */
  title: string;
  description: string;
  og: [string, string];
  eyebrow: string;
  /** In sitemap.xml (and its priority). */
  sitemap?: number;
  /** Shown in the breadcrumb trail. */
  name: string;
  parent?: string;
}

export const SEO_PAGES: SeoPage[] = [
  {
    key: "home",
    path: "/",
    name: "Home",
    title: "Milkywayy | Content Production Studio in Dubai",
    description:
      "Dubai content studio: photography and videography for real estate, holiday homes and brands. Remote editing worldwide and AI presenters.",
    og: ["Content studio", "in Dubai."],
    eyebrow: "Milkywayy · Dubai",
    sitemap: 1,
  },
  {
    key: "production",
    path: "/production",
    name: "Production",
    title: "Photography and Videography in Dubai | Milkywayy",
    description:
      "Photography and videography in Dubai for agencies, developers, hospitality and brands. Monthly shoot days, reels and walkthroughs from AED 4,000.",
    og: ["Monthly content,", "filmed in Dubai."],
    eyebrow: "Production",
    sitemap: 0.9,
  },
  {
    key: "property-shoots",
    path: "/property-shoots",
    name: "Property shoots",
    title: "Real Estate Photographer Dubai | Property Shoots | Milkywayy",
    description:
      "Real estate photographer in Dubai: HDR listing photos, video, twilight shots and 360 virtual tours. Price in a minute, photos within 24 hours, often same day.",
    og: ["Property shoots,", "booked in a minute."],
    eyebrow: "Property shoots · from AED 450",
    sitemap: 0.9,
  },
  {
    key: "post-production",
    path: "/post-production",
    name: "Post-production",
    title: "Real Estate Photo Editing & Video Editing | Milkywayy",
    description:
      "Real estate photo editing, video editing and AI avatars for agencies, media companies and creators worldwide. Edits from $0.80. Free test edit.",
    og: ["Your remote", "editing team."],
    eyebrow: "Post-production · worldwide",
    sitemap: 0.9,
  },
  {
    key: "free-test",
    path: "/post-production/free-test",
    name: "Free test edit",
    parent: "post-production",
    title: "Free Test Edit | Milkywayy",
    description:
      "Book a free test edit: tell us what you need edited, book a 15-minute call, and we edit one listing (up to 10 photos) or one reel for free. No commitment.",
    og: ["See the quality", "first. Free."],
    eyebrow: "Free test edit",
    sitemap: 0.6,
  },
  {
    key: "ai-avatars",
    path: "/ai-avatars",
    name: "AI avatars",
    title: "Custom AI Avatar Video & AI Presenters | Milkywayy",
    description:
      "Custom AI avatar video: an AI presenter with its own face and voice, scripted and edited monthly. For agents, clinics, founders and brands.",
    og: ["Meet Adam.", "He isn't real."],
    eyebrow: "AI avatars",
    sitemap: 0.9,
  },
  {
    key: "work",
    path: "/work",
    name: "Work",
    title: "Work & Case Studies | Milkywayy",
    description:
      "Selected work and case studies from Milkywayy, a Dubai studio: shoots, brand reels, walkthroughs, edits and AI presenters. Filter by format.",
    og: ["Selected", "work."],
    eyebrow: "Work",
    sitemap: 0.7,
  },
  {
    key: "about",
    path: "/about",
    name: "About",
    title: "About Milkywayy | From Dubai's Landmarks to Screens Worldwide",
    description:
      "Milkywayy has captured over 1,000 properties across Dubai, from Atlantis The Royal to Burj Khalifa, and brings the same detail to brand production, editing and AI video worldwide.",
    og: ["From Dubai's landmarks", "to screens worldwide."],
    eyebrow: "About",
    sitemap: 0.6,
  },
  {
    key: "contact",
    path: "/contact",
    name: "Contact",
    title: "Contact | Milkywayy",
    description:
      "Contact Milkywayy for property shoots, monthly content, remote editing or AI avatars. One form for everything; we reply within 15 minutes during working hours.",
    og: ["Tell us what", "you need."],
    eyebrow: "Contact",
    sitemap: 0.7,
  },
  {
    key: "privacy",
    path: "/privacy",
    name: "Privacy",
    title: "Privacy | Milkywayy",
    description:
      "How Milkywayy LLC collects, uses and protects the details you share through this website, including analytics, advertising cookies and your choices.",
    og: ["Privacy", "notice."],
    eyebrow: "Milkywayy LLC",
    sitemap: 0.2,
  },
  {
    key: "terms",
    path: "/terms",
    name: "Terms",
    title: "Terms | Milkywayy",
    description:
      "Terms for using milkywayy.com and requesting shoots, edits and AI avatar work from Milkywayy LLC.",
    og: ["Terms of", "service."],
    eyebrow: "Milkywayy LLC",
    sitemap: 0.2,
  },
];

export const seoPage = (key: string) => SEO_PAGES.find((p) => p.key === key);

/** Keys that services use for Service JSON-LD. */
export const SERVICE_KEYS = [
  "production",
  "property-shoots",
  "post-production",
  "ai-avatars",
] as const;
