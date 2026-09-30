import type { CaseStudy } from "./types";

/**
 * Case studies for /work/[slug] (admin: Case studies). One clearly marked sample shows the
 * template until the owner writes real ones.
 * TODO(owner): real case studies — client (with permission), brief, what we did, real results.
 */
export const caseStudies: CaseStudy[] = [
  {
    id: "sample-brokerage-monthly",
    slug: "sample-monthly-content-for-a-brokerage",
    client: "Dubai brokerage (sample)",
    title: "Monthly listing content for a brokerage",
    heroLines: ["Monthly content", "for a brokerage."],
    summary: "Shoot days, reels and long-form walkthroughs on a monthly plan.",
    brief:
      "A growing brokerage needed every new listing photographed and on social media within days, without briefing a different photographer each time.",
    whatWeDid: [
      "Set up a monthly plan of half and full shoot days across their communities.",
      "Photographed each listing and cut a vertical reel and a long-form walkthrough.",
      "Delivered everything to one dashboard with a monthly statement.",
    ],
    results: [
      { value: "—", label: "Listings shot per month" },
      { value: "—", label: "Reels delivered" },
      { value: "—", label: "Average turnaround" },
    ],
    cover: { alt: "Placeholder: apartment interior from a listing shoot", placeholder: "interior" },
    gallery: [
      { alt: "Placeholder: living room", placeholder: "interior" },
      { alt: "Placeholder: kitchen", placeholder: "kitchen" },
      { alt: "Placeholder: penthouse at night", placeholder: "night" },
    ],
    related: ["item-1", "item-2", "item-5"],
    category: "property",
    published: true,
    sortOrder: 1,
    sample: true,
  },
];
