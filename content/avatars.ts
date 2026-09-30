import type { AvatarExample, AvatarHero } from "./types";

// TODO(owner): the real Adam hero video + poster, and real avatar examples (poster + short clip each).
export const avatarHero: AvatarHero = {
  name: "Adam",
  poster: {
    alt: "Placeholder: Adam, AI presenter, in a bright loft",
    placeholder: "adam",
    bright: true,
  },
  timecode: "REC 00:00:07:12",
  captionLead: "Dubai rents are up again this quarter. Here's what that means",
  captionHighlight: "for buyers.",
  revealTitle: "100% AI",
  revealText: "Face, voice and gestures generated · edited by Milkywayy",
  proofLead: "Clients shown Adam",
  proofHighlight: "didn't spot he was AI",
  sample: true,
};

export const avatars: AvatarExample[] = [
  {
    id: "adam",
    name: "Adam",
    niche: "Real estate · market updates",
    poster: { alt: "Placeholder: real estate avatar", placeholder: "adam", bright: true },
    published: true,
    sortOrder: 1,
    sample: true,
  },
  {
    id: "clinic",
    name: "Clinic host",
    niche: "Treatments · FAQs",
    poster: { alt: "Placeholder: clinic avatar", placeholder: "avatar-clinic", bright: true },
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
    poster: { alt: "Placeholder: coach avatar", placeholder: "avatar-coach", bright: true },
    published: true,
    sortOrder: 4,
    sample: true,
  },
];
