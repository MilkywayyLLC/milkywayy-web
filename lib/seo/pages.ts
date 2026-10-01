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
      "Dubai content studio: property and brand shoots in the UAE, remote photo and video editing worldwide, and AI presenters. Property photos delivered in 24 hours.",
    og: ["Content studio", "in Dubai."],
    eyebrow: "Milkywayy · Dubai",
    sitemap: 1,
  },
  {
    key: "production",
    path: "/production",
    name: "Production",
    title: "Content Production Packages in Dubai | Milkywayy",
    description:
      "Monthly shoot days, edited reels and long-form video for UAE agencies, developers and brands. One Dubai team films, edits and delivers. Packages from AED 4,000.",
    og: ["Monthly content,", "filmed in Dubai."],
    eyebrow: "Production",
    sitemap: 0.9,
  },
  {
    key: "property-shoots",
    path: "/property-shoots",
    name: "Property shoots",
    title: "Real Estate Photography & Video in Dubai | Property Shoots | Milkywayy",
    description:
      "Property photography, video and 360 tours for Dubai listings. See your price in a minute, pick a date and send the booking on WhatsApp. Photos in 24 hours.",
    og: ["Property shoots,", "booked in a minute."],
    eyebrow: "Property shoots · from AED 450",
    sitemap: 0.9,
  },
  {
    key: "post-production",
    path: "/post-production",
    name: "Post-production",
    title: "Photo & Video Editing Services for Agencies | Milkywayy",
    description:
      "Remote photo editing, short-form reels, long-form video and white-label AI avatars for media companies, agencies and creators. Edits from $0.80. Free test edit.",
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
    title: "Custom AI Avatar Videos for Brands | Milkywayy",
    description:
      "A custom AI presenter with its own face and voice, scripted and edited into videos every month. For founders, agents, clinics and brands. Book a demo call.",
    og: ["Meet Adam.", "He isn't real."],
    eyebrow: "AI avatars",
    sitemap: 0.9,
  },
  {
    key: "work",
    path: "/work",
    name: "Work",
    title: "Work | Milkywayy",
    description:
      "Property shoots, brand reels, long-form walkthroughs, photo edits and AI presenters by Milkywayy, a Dubai content studio. Filter by the work you need.",
    og: ["Selected", "work."],
    eyebrow: "Work",
    sitemap: 0.7,
  },
  {
    key: "about",
    path: "/about",
    name: "About",
    title: "About | Milkywayy",
    description:
      "Milkywayy is a Dubai content studio creating content since 2020: property and brand production in the UAE, remote editing and AI presenters. Founded by Akash Praseed.",
    og: ["Creating content", "since 2020."],
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
