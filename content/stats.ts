import type { Stat } from "./types";

// TODO(owner): confirm each number is defensible before launch (guide §6.1).
export const stats: Stat[] = [
  {
    id: "since",
    placementOrder: { "post-production": 4 },
    value: "2020",
    label: "Creating content since",
    placements: ["home", "post-production"],
    published: true,
    sortOrder: 1,
  },
  {
    id: "properties",
    placementOrder: { "post-production": 2 },
    value: "1,000+",
    label: "Properties shot in Dubai",
    labelByPlacement: { "post-production": "Properties produced" },
    placements: ["home", "post-production"],
    published: true,
    sortOrder: 2,
  },
  {
    id: "brands",
    placementOrder: { "post-production": 3 },
    value: "100+",
    label: "Brands worked with",
    placements: ["home", "post-production"],
    published: true,
    sortOrder: 3,
  },
  {
    id: "videos",
    placementOrder: { "post-production": 1 },
    value: "5,000+",
    label: "Videos edited",
    placements: ["home", "post-production"],
    published: true,
    sortOrder: 4,
  },
];
