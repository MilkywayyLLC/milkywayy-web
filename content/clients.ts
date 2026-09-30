import type { Client } from "./types";

// Binghatti removed 30 Sep 2026: work came through an agent, not invoiced directly (owner's call).
export const clients: Client[] = [
  { id: "xperience-realty", name: "Xperience Realty", published: true, sortOrder: 1 },
  { id: "k-estates", name: "K Estates", published: true, sortOrder: 2 },
  { id: "inhouse", name: "Inhouse", published: true, sortOrder: 3 },
];
