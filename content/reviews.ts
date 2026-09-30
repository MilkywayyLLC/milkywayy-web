import type { Review } from "./types";

// TODO(owner): replace with real Google reviews (name, role, company). Shown with a "sample" label.
export const reviews: Review[] = [
  {
    id: "sample-1",
    role: "Leasing manager",
    company: "Dubai brokerage",
    rating: 5,
    text: "We send the address, they handle the rest. Photos are back the next morning and the listing goes live the same day.",
    source: "google",
    placements: ["home"],
    published: true,
    sortOrder: 1,
    sample: true,
  },
  {
    id: "sample-2",
    role: "Marketing lead",
    company: "Developer",
    rating: 5,
    text: "Twenty reels a month without us thinking about it. The content plan alone saved our marketing team hours.",
    source: "google",
    placements: ["home"],
    published: true,
    sortOrder: 2,
    sample: true,
  },
  {
    id: "sample-3",
    role: "Agent",
    company: "Holiday homes",
    rating: 5,
    text: "Clear prices, no chasing files. Everything is in the dashboard with the invoice.",
    source: "google",
    placements: ["home"],
    published: true,
    sortOrder: 3,
    sample: true,
  },
];
