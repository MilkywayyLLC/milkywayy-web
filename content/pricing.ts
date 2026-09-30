import type { OtherPricing, PropertyPricing, ResidentialSize } from "./types";

/**
 * Seed prices (guide §8.3). In Phase 5A these move to the `pricing_*` tables and are edited in
 * the admin; this file stays as the first-run seed and the fallback if the database is down.
 */

const size = (
  label: string,
  photo: number,
  short: number,
  day: number,
  night: number,
  dayNight: number,
  tour: number,
): ResidentialSize => ({ label, photo, short, long: { day, night, dayNight }, tour });

export const propertyPricing: PropertyPricing = {
  currency: "AED",
  apartment: {
    label: "Apartment",
    defaultSize: 1, // 1 Bed
    sizes: [
      size("Studio", 450, 300, 500, 600, 800, 500),
      size("1 Bed", 500, 300, 600, 700, 950, 600),
      size("2 Bed", 550, 350, 700, 800, 1100, 700),
      size("3 Bed", 650, 400, 800, 900, 1200, 800),
      size("4 Bed", 750, 400, 900, 1000, 1350, 900),
      size("5 Bed", 850, 450, 1000, 1200, 1500, 1000),
    ],
  },
  villa: {
    label: "Villa / townhouse",
    defaultSize: 0, // 2 Bed
    sizes: [
      size("2 Bed", 700, 400, 900, 1000, 1250, 900),
      size("3 Bed", 800, 450, 950, 1100, 1400, 950),
      size("4 Bed", 900, 550, 1050, 1200, 1500, 1100),
      size("5 Bed", 1100, 650, 1150, 1300, 1600, 1250),
      size("6 Bed", 1200, 750, 1250, 1400, 1800, 1400),
      size("7 Bed", 1400, 800, 1350, 1600, 2000, 1500),
    ],
  },
  commercial: {
    label: "Commercial",
    defaultTier: 1, // Essential
    tiers: [
      {
        label: "Basic",
        description: "Small spaces",
        photo: 450,
        short: 300,
        long: null,
        tour: null,
        includes: { photos: "Up to 15", reel: "30–45 s", walkthrough: null, tourHotspots: null },
      },
      {
        label: "Essential",
        description: "Most offices",
        popular: true,
        photo: 550,
        short: 350,
        long: 600,
        tour: 600,
        includes: {
          photos: "Up to 20",
          reel: "45–60 s",
          walkthrough: "3–5 min",
          tourHotspots: "8–10 hotspots",
        },
      },
      {
        label: "Premium",
        description: "Large commercial spaces",
        photo: 700,
        short: 450,
        long: 800,
        tour: 800,
        includes: {
          photos: "Up to 30",
          reel: "60–75 s",
          walkthrough: "5–10 min",
          tourHotspots: "Up to 15 hotspots",
        },
      },
      {
        label: "Executive",
        description: "HQ / warehouses",
        photo: 850,
        short: 500,
        long: 1000,
        tour: 1000,
        includes: {
          photos: "Up to 40",
          reel: "60–90 s",
          walkthrough: "8–15 min",
          tourHotspots: "Up to 20 hotspots",
        },
      },
    ],
  },
  twilight: {
    standard: { 5: 120, 10: 220, 20: 400 },
    villa: { 5: 150, 10: 275, 20: 500 },
  },
  delivery: { photo: "24h", short: "24–48h", long: "24–48h", tour: "48–72h" },
};

export const otherPricing: OtherPricing = {
  production: {
    fromMonthly: 4000,
    chips: ["Shoot days", "Edited reels", "Long-form video", "Photography", "360 tours"],
  },
  postProduction: {
    currency: "USD",
    rates: [
      {
        key: "photo",
        name: "Photo edits",
        amount: 0.8,
        unit: "HDR photo",
        bullets: [
          "Bracket blending and window pulls",
          "Sky replacement and declutter",
          "Twilight on request",
        ],
      },
      {
        key: "short",
        name: "Short-form",
        amount: 50,
        unit: "reel",
        bullets: [
          "Reels up to 60 seconds",
          "Music, captions and branding",
          "Formatted for every platform",
        ],
      },
      {
        key: "long",
        name: "Long-form",
        amount: 150,
        unit: "video",
        bullets: [
          "YouTube videos up to 10 minutes",
          "B-roll, graphics and titles",
          "Thumbnail on request",
        ],
      },
    ],
    note: "Rates in USD. Your final quote depends on volume, style and turnaround, and we can quote in your currency on the call.",
  },
  aiAvatars: {
    // TODO(owner): real AI avatar prices. Until then the site shows the launch-pricing line.
    launchLine: "Launch pricing · set on your demo call",
    extraAvatarNote: "Each extra avatar is added with its own setup fee.",
    tiers: [
      {
        name: "Avatar setup",
        cadence: "One-off",
        bullets: ["Custom face and look", "Voice selection", "3 test videos", "Yours to keep"],
      },
      {
        name: "Videos",
        cadence: "Monthly",
        bullets: [
          "Everything in setup",
          "Monthly video bundle",
          "Captions and branding",
          "You send scripts or topics",
        ],
      },
      {
        name: "Videos + strategy",
        cadence: "Monthly",
        bullets: [
          "Everything in Videos",
          "Content strategy",
          "We write every script",
          "Monthly performance review",
        ],
      },
    ],
  },
};
