import type { SiteSettings } from "./types";

export const siteSettings: SiteSettings = {
  company: "Milkywayy LLC",
  licence: "Sharjah Media City",
  addressLine: "Dubai, UAE",
  whatsapp: { number: "971507263306", display: "+971 50 726 3306" },
  email: "hello@milkywayy.com",
  instagram: { handle: "@milkywayy_com", url: "https://www.instagram.com/milkywayy_com" },
  linkedin: { handle: "milkywayy-com", url: "https://www.linkedin.com/company/milkywayy-com" },
  // TODO(owner): Google review count + profile link (needed for aggregateRating JSON-LD).
  googleRating: { value: 5.0, count: null },
  founder: {
    name: "Akash Praseed",
    role: "Founder, Milkywayy",
    quote:
      "After years of creating content, we know where production slows down: the follow-ups, the revisions, the back-and-forth. So we're building systems that take them out. You book, we shoot, you download.",
    photo: {
      src: "/founder.webp",
      alt: "Akash Praseed, founder of Milkywayy",
      // Head sits at 12–40% of the height, centred at ~57%: keep it in frame at any ratio.
      focus: "55% 15%",
    },
  },
  // TODO(owner): showreel video + poster.
  showreel: {
    alt: "Showreel placeholder: Dubai skyline at dusk",
    placeholder: "dusk",
    duration: "0:45",
  },
  booking: {
    slots: ["Morning", "Afternoon", "Evening"],
    // Sunday is the only off day (owner, 30 Sep 2026). [] = 7 days a week.
    closedWeekdays: [0],
    windowDays: 60,
    multiPropertyNote:
      "Shooting more than one property on the same day or in the same area? We'll send you a better price for the whole booking in the same chat.",
  },
  proofStripPages: ["home", "production"],
  footerLine: "A Dubai content studio. Production in the UAE, editing and AI presenters worldwide.",
};
