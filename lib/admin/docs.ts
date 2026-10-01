import type { Tag } from "@/lib/data/tags";
import { CROPS, type Field } from "./fields";

/**
 * Single documents (one JSON value each) with a draft → preview → publish flow. Drafts live in
 * the `drafts` table; publishing writes the live row and logs every changed field, old → new.
 */
export interface Doc {
  key: "site" | "pricing_other" | "avatar_hero";
  title: string;
  /** Where the live value is stored. */
  table: "site_settings" | "pricing_other";
  tags: Tag[];
  ownerOnly: boolean;
  /** Prices: publishing asks for confirmation with the full old → new list. */
  isPrice: boolean;
  preview: string;
  groups: { title: string; fields: Field[] }[];
}

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].map(
  (d, i) => ({ value: String(i), label: d }),
);

export const DOCS: Doc[] = [
  {
    key: "site",
    title: "Site settings",
    table: "site_settings",
    tags: ["site"],
    ownerOnly: true,
    isPrice: false,
    preview: "/contact",
    groups: [
      {
        title: "Contact",
        fields: [
          {
            name: "whatsapp.number",
            kind: "text",
            label: "WhatsApp number (digits only, with 971)",
            required: true,
            max: 15,
          },
          {
            name: "whatsapp.display",
            kind: "text",
            label: "WhatsApp number as shown",
            required: true,
            max: 24,
          },
          { name: "email", kind: "text", label: "Email", required: true, max: 80 },
          { name: "addressLine", kind: "text", label: "Address line", required: true, max: 80 },
          { name: "instagram.handle", kind: "text", label: "Instagram handle", max: 40 },
          { name: "instagram.url", kind: "url", label: "Instagram link" },
          { name: "linkedin.handle", kind: "text", label: "LinkedIn handle", max: 40 },
          { name: "linkedin.url", kind: "url", label: "LinkedIn link" },
        ],
      },
      {
        title: "Company",
        fields: [
          { name: "company", kind: "text", label: "Company name", required: true, max: 60 },
          { name: "licence", kind: "text", label: "Licence line", required: true, max: 80 },
          {
            name: "footerLine",
            kind: "textarea",
            label: "Footer line",
            required: true,
            max: 200,
            rows: 2,
          },
        ],
      },
      {
        title: "Google rating",
        fields: [
          {
            name: "googleRating.value",
            kind: "number",
            label: "Rating",
            min: 1,
            max: 5,
            step: 0.1,
            required: true,
          },
          {
            name: "googleRating.count",
            kind: "number",
            label: "Number of reviews (empty hides it)",
            min: 0,
            max: 100000,
          },
          { name: "googleRating.url", kind: "url", label: "Google reviews link" },
        ],
      },
      {
        title: "Founder (About)",
        fields: [
          { name: "founder.name", kind: "text", label: "Name", required: true, max: 60 },
          { name: "founder.role", kind: "text", label: "Role", required: true, max: 60 },
          { name: "founder.quote", kind: "textarea", label: "Quote", required: true, max: 500 },
          {
            name: "founder.photo",
            kind: "image",
            label: "Photo",
            required: true,
            crops: [CROPS.portrait, CROPS.square, CROPS.wide],
          },
        ],
      },
      {
        title: "Showreel (Home)",
        fields: [
          {
            name: "showreel",
            kind: "image",
            label: "Poster and video",
            required: true,
            video: true,
            crops: [CROPS.wide],
          },
          { name: "showreel.duration", kind: "text", label: "Duration label", max: 8 },
        ],
      },
      {
        title: "Booking",
        fields: [
          {
            name: "booking.slots",
            kind: "lines",
            label: "Time slots (one per line; the last one is the evening slot)",
            required: true,
            max: 6,
            maxLength: 20,
          },
          {
            name: "booking.closedWeekdays",
            kind: "multi",
            label: "Days off",
            options: DAYS,
            numeric: true,
          },
          {
            name: "booking.windowDays",
            kind: "number",
            label: "How far ahead people can book",
            min: 7,
            max: 365,
            unit: "days",
            required: true,
          },
          {
            name: "booking.multiPropertyNote",
            kind: "textarea",
            label: "Multi-property note",
            required: true,
            max: 300,
            rows: 3,
          },
        ],
      },
    ],
  },
  {
    key: "pricing_other",
    title: "Other prices",
    table: "pricing_other",
    tags: ["pricing"],
    ownerOnly: true,
    isPrice: true,
    preview: "/post-production#rates",
    groups: [
      {
        title: "Production",
        fields: [
          {
            name: "production.fromMonthly",
            kind: "number",
            label: "Packages from (AED a month)",
            min: 0,
            max: 1000000,
            required: true,
            unit: "AED",
          },
          {
            name: "production.chips",
            kind: "lines",
            label: "Included items (one per line)",
            max: 8,
            maxLength: 30,
          },
        ],
      },
      { title: "Post-production starting rates (USD)", fields: postRates() },
      { title: "AI avatars", fields: avatarTiers() },
    ],
  },
  {
    key: "avatar_hero",
    title: "AI avatars hero (Adam)",
    table: "site_settings",
    tags: ["avatars"],
    ownerOnly: false,
    isPrice: false,
    preview: "/ai-avatars",
    groups: [
      {
        title: "Hero",
        fields: [
          { name: "name", kind: "text", label: "Presenter name", required: true, max: 30 },
          {
            name: "poster",
            kind: "image",
            label: "Poster",
            required: true,
            bright: true,
            crops: [CROPS.reel, CROPS.portrait],
          },
          { name: "clip", kind: "video", label: "Clip (Bunny, Mux, YouTube or Vimeo link)" },
          { name: "timecode", kind: "text", label: "Timecode text", max: 24 },
          { name: "captionLead", kind: "text", label: "Caption", required: true, max: 90 },
          {
            name: "captionHighlight",
            kind: "text",
            label: "Caption highlight (end of the caption)",
            required: true,
            max: 30,
          },
          { name: "revealTitle", kind: "text", label: "Reveal title", required: true, max: 20 },
          { name: "revealText", kind: "text", label: "Reveal text", required: true, max: 80 },
          { name: "proofLead", kind: "text", label: "Proof line", required: true, max: 60 },
          {
            name: "proofHighlight",
            kind: "text",
            label: "Proof highlight",
            required: true,
            max: 40,
          },
          {
            name: "sample",
            kind: "toggle",
            label: "Sample",
            help: "Shows a “sample” label until the real video is in.",
          },
        ],
      },
    ],
  },
];

function postRates(): Field[] {
  const rates: Field[] = [0, 1, 2].flatMap((i): Field[] => [
    {
      name: `postProduction.rates.${i}.name`,
      kind: "text",
      label: `Rate ${i + 1}: name`,
      required: true,
      max: 30,
    },
    {
      name: `postProduction.rates.${i}.amount`,
      kind: "number",
      label: `Rate ${i + 1}: from (USD)`,
      min: 0,
      max: 100000,
      step: 0.01,
      required: true,
      unit: "USD",
    },
    {
      name: `postProduction.rates.${i}.unit`,
      kind: "text",
      label: `Rate ${i + 1}: per`,
      required: true,
      max: 20,
    },
    {
      name: `postProduction.rates.${i}.bullets`,
      kind: "lines",
      label: `Rate ${i + 1}: bullets`,
      max: 5,
      maxLength: 60,
    },
  ]);
  return [
    ...rates,
    {
      name: "postProduction.note",
      kind: "textarea",
      label: "Note under the rates",
      max: 300,
      rows: 3,
    },
  ];
}

function avatarTiers(): Field[] {
  return [
    {
      name: "aiAvatars.launchLine",
      kind: "text",
      label: "Launch pricing line",
      required: true,
      max: 60,
    },
    { name: "aiAvatars.extraAvatarNote", kind: "text", label: "Extra avatar note", max: 120 },
    ...[0, 1, 2].flatMap((i): Field[] => [
      {
        name: `aiAvatars.tiers.${i}.name`,
        kind: "text",
        label: `Tier ${i + 1}: name`,
        required: true,
        max: 30,
      },
      {
        name: `aiAvatars.tiers.${i}.cadence`,
        kind: "text",
        label: `Tier ${i + 1}: cadence`,
        required: true,
        max: 20,
      },
      {
        name: `aiAvatars.tiers.${i}.bullets`,
        kind: "lines",
        label: `Tier ${i + 1}: bullets`,
        max: 6,
        maxLength: 60,
      },
    ]),
  ];
}

export const docByKey = (key: string) => DOCS.find((d) => d.key === key);
export const docFields = (d: Doc) => d.groups.flatMap((g) => g.fields);

/** pricing_other stores three keys; the editor works on them as one object. */
export const PRICING_OTHER_KEYS = {
  production: "production",
  postProduction: "post_production",
  aiAvatars: "ai_avatars",
} as const;
