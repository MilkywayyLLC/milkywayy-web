import type { Stat } from "./types";

// TODO(owner): confirm each number is defensible before launch (guide §6.1).
export const stats: Stat[] = [
  {
    id: "since",
    value: "2020",
    label: "Creating content since",
    placements: ["home", "post-production"],
    published: true,
    sortOrder: 1,
  },
  {
    id: "properties",
    value: "1,000+",
    label: "Properties shot in Dubai",
    labelByPlacement: { "post-production": "Properties produced" },
    placements: ["home", "post-production"],
    published: true,
    sortOrder: 2,
  },
  {
    id: "brands",
    value: "100+",
    label: "Brands worked with",
    placements: ["home", "post-production"],
    published: true,
    sortOrder: 3,
  },
  {
    id: "videos",
    value: "5,000+",
    label: "Videos edited",
    placements: ["home", "post-production"],
    published: true,
    sortOrder: 4,
  },
];

/** Post-production shows the same stats in a different order (mockup). */
export const statOrderByPlacement: Record<"home" | "post-production", string[]> = {
  home: ["since", "properties", "brands", "videos"],
  "post-production": ["videos", "properties", "brands", "since"],
};
