import type { AvatarExample } from "./types";

// TODO(owner): real avatar examples (poster + short clip each).
export const avatars: AvatarExample[] = [
  {
    id: "adam",
    name: "Adam",
    niche: "Real estate · market updates",
    poster: { alt: "Placeholder: AI presenter Adam", placeholder: "adam" },
    published: true,
    sortOrder: 1,
    sample: true,
  },
  {
    id: "clinic",
    name: "Clinic host",
    niche: "Treatments · FAQs",
    poster: { alt: "Placeholder: clinic avatar", placeholder: "avatar-clinic" },
    published: true,
    sortOrder: 2,
    sample: true,
  },
  {
    id: "finance",
    name: "Finance explainer",
    niche: "Mortgages · investment",
    poster: { alt: "Placeholder: finance avatar", placeholder: "avatar-finance" },
    published: true,
    sortOrder: 3,
    sample: true,
  },
  {
    id: "coach",
    name: "Coach",
    niche: "Courses · personal brand",
    poster: { alt: "Placeholder: coach avatar", placeholder: "avatar-coach" },
    published: true,
    sortOrder: 4,
    sample: true,
  },
];
