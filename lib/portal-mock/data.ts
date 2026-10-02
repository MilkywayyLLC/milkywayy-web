/**
 * Fake data for the portal mockup (/portal-preview, CLIENT_PORTAL_GUIDE.md Phase 9 step 1).
 * Nothing here is real: names, companies, numbers and refs are invented. No database.
 */
import type { PlaceholderKey } from "@/content/types";

export type Persona = "all" | "shoots" | "post";
export type Service = "shoots" | "editing" | "avatars";

import { AVATAR_STEPS, EDIT_STEPS, SHOOT_STEPS } from "@/lib/portal/steps";
export { AVATAR_STEPS, EDIT_STEPS, SHOOT_STEPS };

export interface Account {
  id: Persona;
  name: string;
  kind: "company" | "individual";
  industry: string;
  currency: "AED" | "USD";
  services: Service[];
  plan:
    | {
        mode: "package";
        name: string;
        price: number;
        renews: string;
        usage: { label: string; used: number; of: number }[];
      }
    | { mode: "payg" };
  me: {
    name: string;
    role: "Owner" | "Admin" | "Member";
    phone?: string;
    email: string;
    initials: string;
  };
  login: "whatsapp" | "email";
}

export const ACCOUNTS: Record<Persona, Account> = {
  all: {
    id: "all",
    name: "Harbourline Properties",
    kind: "company",
    industry: "Real estate brokerage",
    currency: "AED",
    services: ["shoots", "editing", "avatars"],
    plan: {
      mode: "package",
      name: "Growth",
      price: 6500,
      renews: "1 Nov 2026",
      usage: [
        { label: "Shoot days", used: 3, of: 4 },
        { label: "Reels", used: 7, of: 10 },
        { label: "Long-form videos", used: 1, of: 2 },
      ],
    },
    me: {
      name: "Rania Haddad",
      role: "Owner",
      phone: "+971 55 214 7390",
      email: "rania@harbourline.example",
      initials: "RH",
    },
    login: "whatsapp",
  },
  shoots: {
    id: "shoots",
    name: "Omar Siddiqui",
    kind: "individual",
    industry: "Independent agent",
    currency: "AED",
    services: ["shoots"],
    plan: { mode: "payg" },
    me: {
      name: "Omar Siddiqui",
      role: "Owner",
      phone: "+971 50 338 1042",
      email: "omar.s@example.com",
      initials: "OS",
    },
    login: "whatsapp",
  },
  post: {
    id: "post",
    name: "Northlake Media Co.",
    kind: "company",
    industry: "Agency",
    currency: "USD",
    services: ["editing"],
    plan: { mode: "payg" },
    me: { name: "Jenna Morales", role: "Owner", email: "jenna@northlake.example", initials: "JM" },
    login: "email",
  },
};

/* ---------- shoots ---------- */

export interface Shoot {
  id: string;
  ref: string;
  title: string;
  address: string;
  date: string;
  slot: string;
  services: string[];
  status: (typeof SHOOT_STEPS)[number];
  photo: PlaceholderKey;
  owner: Persona[];
  deliveries?: {
    name: string;
    items: { kind: "Photos" | "Reel" | "Long-form" | "360 tour"; count?: string; size: string }[];
    at: string;
  }[];
  revision?: { used: number; of: number };
  property: { type: string; beds: string };
}

export const SHOOTS: Shoot[] = [
  {
    id: "s-1188",
    ref: "MW-1188",
    title: "2 Bed apartment, Marina Gate 1",
    address: "Unit 2304, Marina Gate 1, Dubai Marina",
    date: "Thu 8 Oct",
    slot: "Morning",
    services: ["Photography", "Short-form video"],
    status: "Requested",
    photo: "interior",
    owner: ["all", "shoots"],
    property: { type: "Apartment", beds: "2 Bed" },
  },
  {
    id: "s-1181",
    ref: "MW-1181",
    title: "4 Bed villa, Arabian Ranches",
    address: "Villa 17, Savannah, Arabian Ranches",
    date: "Mon 5 Oct",
    slot: "Evening",
    services: ["Photography", "10 twilight", "Long-form (day + night)"],
    status: "Confirmed",
    photo: "villa-dusk",
    owner: ["all", "shoots"],
    property: { type: "Villa", beds: "4 Bed" },
  },
  {
    id: "s-1176",
    ref: "MW-1176",
    title: "3 Bed penthouse, Downtown",
    address: "Unit 5101, Burj Vista 1, Downtown Dubai",
    date: "Sat 26 Sep",
    slot: "Afternoon",
    services: ["Photography", "Short-form video", "360 tour"],
    status: "Delivered",
    photo: "night",
    owner: ["all", "shoots"],
    property: { type: "Apartment", beds: "3 Bed" },
    deliveries: [
      {
        name: "Delivery 1",
        at: "Mon 28 Sep, 10:42",
        items: [
          { kind: "Photos", count: "28 photos", size: "412 MB" },
          { kind: "Reel", count: "1 reel · 0:45", size: "186 MB" },
          { kind: "360 tour", count: "Link", size: "" },
        ],
      },
    ],
    revision: { used: 0, of: 2 },
  },
  {
    id: "s-1162",
    ref: "MW-1162",
    title: "1 Bed apartment, JVC",
    address: "Unit 806, Bloom Towers, JVC",
    date: "Tue 15 Sep",
    slot: "Morning",
    services: ["Photography"],
    status: "Completed",
    photo: "kitchen",
    owner: ["all", "shoots"],
    property: { type: "Apartment", beds: "1 Bed" },
    deliveries: [
      {
        name: "Delivery 1",
        at: "Wed 16 Sep, 09:10",
        items: [{ kind: "Photos", count: "18 photos", size: "264 MB" }],
      },
    ],
    revision: { used: 1, of: 2 },
  },
];

/* ---------- editing batches ---------- */

export interface Batch {
  id: string;
  ref: string;
  title: string;
  kind: string;
  count: string;
  submitted: string;
  status: (typeof EDIT_STEPS)[number] | "On hold";
  hold?: string;
  owner: Persona[];
  revision: {
    used: number;
    of: number;
    state?: "Revision requested" | "Revision in progress" | "Revision delivered";
  };
  latest?: string;
  files: { label: string; url: string }[];
  notes: string;
  deliveries: { name: string; at: string; note?: string; files: string }[];
  thread: { who: string; admin?: boolean; at: string; body: string }[];
}

export const BATCHES: Batch[] = [
  {
    id: "b-2041",
    ref: "MW-2041",
    title: "Lakeshore condos: October listings",
    kind: "HDR photos",
    count: "142 photos",
    submitted: "Thu 1 Oct",
    status: "Delivered",
    owner: ["all", "post"],
    revision: { used: 1, of: 2, state: "Revision delivered" },
    latest: "Revision 1 delivered · Fri 2 Oct",
    files: [
      { label: "Raw brackets (Dropbox)", url: "dropbox.com/sh/…/lakeshore-oct" },
      { label: "Style reference", url: "drive.google.com/…/style-guide" },
    ],
    notes: "Match last month's warm whites. Windows pulled, skies blue unless dusk.",
    deliveries: [
      { name: "Delivery 1", at: "Thu 1 Oct, 21:15", files: "142 photos · 1.1 GB" },
      {
        name: "Revision 1",
        at: "Fri 2 Oct, 11:02",
        note: "Unit 1204: straighter verticals; 8 photos re-done",
        files: "8 photos · 64 MB",
      },
    ],
    thread: [
      {
        who: "Jenna Morales",
        at: "Thu 1 Oct, 22:40",
        body: "Unit 1204 verticals lean on 8 shots (IMG_3321–3328). Can you straighten?",
      },
      {
        who: "Milkywayy",
        admin: true,
        at: "Fri 2 Oct, 11:03",
        body: "Done: Revision 1 is up. You have 1 revision round left on this batch.",
      },
    ],
  },
  {
    id: "b-2044",
    ref: "MW-2044",
    title: "Founder Q&A reels (x6)",
    kind: "Short-form",
    count: "6 reels",
    submitted: "Fri 2 Oct",
    status: "In editing",
    owner: ["all", "post"],
    revision: { used: 0, of: 2 },
    latest: "Due Mon 5 Oct",
    files: [{ label: "Raw footage (Frame.io)", url: "frame.io/…/founder-qa" }],
    notes: "Captions burned in, brand font, 9:16, 30–45 s each.",
    deliveries: [],
    thread: [],
  },
  {
    id: "b-2046",
    ref: "MW-2046",
    title: "Riverside townhome walkthrough",
    kind: "Long-form",
    count: "1 video",
    submitted: "Fri 2 Oct",
    status: "On hold",
    hold: "Waiting on client: the music licence file is missing",
    owner: ["all", "post"],
    revision: { used: 0, of: 2 },
    files: [{ label: "Footage (WeTransfer)", url: "we.tl/…/riverside" }],
    notes: "",
    deliveries: [],
    thread: [],
  },
  {
    id: "b-2047",
    ref: "MW-2047",
    title: "Aerials batch, Willow Creek",
    kind: "HDR photos",
    count: "40 photos",
    submitted: "Fri 2 Oct",
    status: "Submitted",
    owner: ["all", "post"],
    revision: { used: 0, of: 2 },
    files: [{ label: "Raw (Drive)", url: "drive.google.com/…/willow" }],
    notes: "",
    deliveries: [],
    thread: [],
  },
];

export const COMPLETED_BATCHES = [
  {
    ref: "MW-1998",
    title: "September listings (bulk)",
    kind: "HDR photos",
    count: "212 photos",
    done: "28 Sep",
  },
  {
    ref: "MW-1971",
    title: "Open-house teaser reels",
    kind: "Short-form",
    count: "4 reels",
    done: "19 Sep",
  },
  {
    ref: "MW-1950",
    title: "Maple Ave virtual twilight",
    kind: "HDR photos",
    count: "12 photos",
    done: "11 Sep",
  },
  {
    ref: "MW-1902",
    title: "Brand story: 'Why Northlake'",
    kind: "Long-form",
    count: "1 video",
    done: "30 Aug",
  },
];

/* ---------- avatars ---------- */

export const AVATAR_VIDEOS = [
  {
    id: "a-311",
    ref: "MW-3110",
    title: "October market update (EN)",
    status: "Script ready" as (typeof AVATAR_STEPS)[number],
    presenter: "Adam",
    due: "Video by Thu 8 Oct",
    script:
      "Dubai rents rose again in Q3, led by the Marina and JVC. For buyers, that means the gap between renting and owning is closing. Here are three areas where the numbers now favour buying, and what to check before you sign…",
  },
  {
    id: "a-308",
    ref: "MW-3082",
    title: "How to read a service charge",
    status: "In production" as (typeof AVATAR_STEPS)[number],
    presenter: "Adam",
    due: "Due Tue 6 Oct",
  },
  {
    id: "a-301",
    ref: "MW-3015",
    title: "Golden visa via property (AR)",
    status: "Delivered" as (typeof AVATAR_STEPS)[number],
    presenter: "Adam",
    due: "Delivered 29 Sep",
  },
];

/* ---------- billing ---------- */

export const INVOICES: Record<
  Persona,
  { no: string; date: string; amount: string; status: "Due" | "Paid" | "Overdue" }[]
> = {
  all: [
    { no: "INV-2026-0412", date: "1 Oct 2026", amount: "AED 6,500", status: "Due" },
    { no: "INV-2026-0371", date: "1 Sep 2026", amount: "AED 7,150", status: "Paid" },
    { no: "INV-2026-0330", date: "1 Aug 2026", amount: "AED 6,500", status: "Paid" },
  ],
  shoots: [
    { no: "INV-2026-0405", date: "28 Sep 2026", amount: "AED 1,300", status: "Due" },
    { no: "INV-2026-0388", date: "16 Sep 2026", amount: "AED 500", status: "Paid" },
    { no: "INV-2026-0301", date: "22 Jul 2026", amount: "AED 900", status: "Overdue" },
  ],
  post: [
    { no: "INV-2026-0399", date: "30 Sep 2026", amount: "USD 1,946", status: "Paid" },
    { no: "INV-2026-0352", date: "31 Aug 2026", amount: "USD 1,712", status: "Paid" },
  ],
};

export const PAYG_LINES: Record<Persona, { item: string; qty: number; unit: number }[]> = {
  all: [
    { item: "Extra reel (over package)", qty: 1, unit: 300 },
    { item: "Twilight conversions (10)", qty: 1, unit: 220 },
  ],
  shoots: [
    { item: "3 Bed penthouse: photography", qty: 1, unit: 650 },
    { item: "3 Bed penthouse: short-form", qty: 1, unit: 400 },
    { item: "3 Bed penthouse: 360 tour", qty: 1, unit: 800 },
  ],
  post: [
    { item: "HDR photo edits", qty: 150, unit: 0.8 },
    { item: "Short-form reels", qty: 6, unit: 50 },
    { item: "Long-form video", qty: 1, unit: 150 },
  ],
};

export const SUGGESTION: Record<
  Persona,
  { pkg: string; price: string; saving: string; why: string } | null
> = {
  all: null,
  shoots: {
    pkg: "Starter",
    price: "AED 2,500 / month",
    saving: "AED 450",
    why: "You've averaged 3 shoots a month since July.",
  },
  post: {
    pkg: "Editing Pro",
    price: "USD 1,500 / month",
    saving: "USD 310",
    why: "Your last 3 months averaged USD 1,780.",
  },
};

/* ---------- listings ---------- */

export const CONTACTS = [
  {
    id: "c1",
    name: "Rania Haddad",
    role: "Managing partner",
    brn: "BRN 48213",
    whatsapp: "+971 55 214 7390",
    initials: "RH",
    default: true,
  },
  {
    id: "c2",
    name: "Karim Aoun",
    role: "Sales agent",
    brn: "BRN 51907",
    whatsapp: "+971 52 660 1184",
    initials: "KA",
  },
  {
    id: "c3",
    name: "Leila Farouk",
    role: "Leasing agent",
    brn: "BRN 50331",
    whatsapp: "+971 56 902 7745",
    initials: "LF",
  },
];

export const LISTINGS = [
  {
    slug: "burj-vista-3br-penthouse",
    title: "Sky-high 3 bed penthouse with Burj views",
    purpose: "Sale",
    price: "AED 6,950,000",
    place: "Burj Vista 1, Downtown Dubai",
    facts: ["3 Bed", "4 Bath", "2,410 sq ft", "Furnished"],
    highlights: ["Burj Khalifa view", "Private terrace", "Chiller free", "Vacant on transfer"],
    photo: "night" as PlaceholderKey,
    views: 412,
    taps: 23,
    status: "Live",
  },
  {
    slug: "bloom-towers-1br",
    title: "Bright 1 bed in Bloom Towers",
    purpose: "Rent yearly",
    price: "AED 78,000 / year",
    place: "Bloom Towers, JVC",
    facts: ["1 Bed", "2 Bath", "812 sq ft", "Unfurnished"],
    highlights: ["Balcony", "Pool and gym", "Near Circle Mall"],
    photo: "kitchen" as PlaceholderKey,
    views: 168,
    taps: 9,
    status: "Paused",
  },
];

export const TEAM = [
  { name: "Rania Haddad", role: "Owner", contact: "+971 55 214 7390", status: "Active" },
  { name: "Karim Aoun", role: "Member", contact: "+971 52 660 1184", status: "Active" },
  { name: "Leila Farouk", role: "Member", contact: "leila@harbourline.example", status: "Invited" },
  { name: "Sam Patel", role: "Admin", contact: "sam@harbourline.example", status: "Active" },
];

/* ---------- admin board ---------- */

export const BOARD = [
  {
    ref: "MW-1188",
    client: "Harbourline Properties",
    title: "2 Bed, Marina Gate 1",
    type: "Shoot",
    status: "Requested",
    when: "Thu 8 Oct · Morning",
  },
  {
    ref: "MW-1190",
    client: "Omar Siddiqui",
    title: "Studio, Sobha Hartland",
    type: "Shoot",
    status: "Requested",
    when: "Fri 9 Oct · Afternoon",
  },
  {
    ref: "MW-1181",
    client: "Harbourline Properties",
    title: "4 Bed villa, Arabian Ranches",
    type: "Shoot",
    status: "Confirmed",
    when: "Mon 5 Oct · Evening",
  },
  {
    ref: "MW-1179",
    client: "Desert Rose Holiday Homes",
    title: "Townhouse, Town Square",
    type: "Shoot",
    status: "Shot",
    when: "Shot Thu 1 Oct",
  },
  {
    ref: "MW-2044",
    client: "Northlake Media Co.",
    title: "Founder Q&A reels (x6)",
    type: "Edit",
    status: "In editing",
    when: "Due Mon 5 Oct",
  },
  {
    ref: "MW-3082",
    client: "Harbourline Properties",
    title: "Service charge explainer",
    type: "Avatar",
    status: "In editing",
    when: "Due Tue 6 Oct",
  },
  {
    ref: "MW-1176",
    client: "Harbourline Properties",
    title: "3 Bed penthouse, Downtown",
    type: "Shoot",
    status: "Delivered",
    when: "Delivered 28 Sep",
  },
  {
    ref: "MW-2041",
    client: "Northlake Media Co.",
    title: "Lakeshore condos: October",
    type: "Edit",
    status: "Revision",
    when: "Rev 1 of 2 delivered",
  },
  {
    ref: "MW-2046",
    client: "Northlake Media Co.",
    title: "Riverside walkthrough",
    type: "Edit",
    status: "On hold",
    when: "Waiting on client",
  },
];
export const BOARD_COLUMNS = [
  "Requested",
  "Confirmed",
  "Shot",
  "In editing",
  "Delivered",
  "Revision",
  "On hold",
] as const;

/** Business chat number (Site settings). The Twilio notifications number never appears as a chat link. */
export const CHAT_NUMBER = "971507263306";
export const waChat = (text: string) =>
  `https://wa.me/${CHAT_NUMBER}?text=${encodeURIComponent(text)}`;

export const ACTIVITY: Record<Persona, { at: string; body: string; href: string }[]> = {
  all: [
    {
      at: "Today 11:02",
      body: "MW-2041 · Revision 1 delivered (8 photos)",
      href: "editing/MW-2041",
    },
    { at: "Today 09:30", body: "MW-3110 · Script ready for your approval", href: "avatars" },
    { at: "Yesterday 18:12", body: "MW-1181 · Confirmed for Mon 5 Oct, evening", href: "shoots" },
    {
      at: "Mon 28 Sep",
      body: "MW-1176 · Delivered: 28 photos, 1 reel, 360 tour",
      href: "shoots/MW-1176",
    },
    {
      at: "Mon 28 Sep",
      body: "Karim Aoun shared Burj Vista penthouse (412 views)",
      href: "listings",
    },
  ],
  shoots: [
    { at: "Yesterday 18:12", body: "MW-1181 · Confirmed for Mon 5 Oct, evening", href: "shoots" },
    {
      at: "Mon 28 Sep",
      body: "MW-1176 · Delivered: 28 photos, 1 reel, 360 tour",
      href: "shoots/MW-1176",
    },
    { at: "Mon 28 Sep", body: "Invoice INV-2026-0405 issued · AED 1,300", href: "billing" },
  ],
  post: [
    {
      at: "Today 11:02",
      body: "MW-2041 · Revision 1 delivered (8 photos)",
      href: "editing/MW-2041",
    },
    {
      at: "Today 08:15",
      body: "MW-2046 · On hold: the music licence file is missing",
      href: "editing/MW-2046",
    },
    { at: "Fri 2 Oct", body: "MW-2044 · In editing, due Mon 5 Oct", href: "editing/MW-2044" },
  ],
};
