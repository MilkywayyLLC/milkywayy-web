/** Booking labels shared by the portal and the website's dashboard previews (no logic). */
type ServiceKey = "property" | "videos" | "reels" | "long_form";
export const SERVICE_LABEL: Record<ServiceKey, string> = {
  property: "Photos",
  videos: "Videos",
  // Older bookings.
  reels: "Agent / social reels",
  long_form: "Long-form walkthrough",
};
export const SERVICE_HINT: Record<ServiceKey, string> = {
  property: "Priced by property type and size. Twilight and 360 tour as add-ons",
  videos: "Agent reels and property walkthroughs, one price per video",
  reels: "Vertical 9:16 walkthroughs and agent-presented videos",
  long_form: "Horizontal 16:9 walkthrough for YouTube",
};
/** The two video counters. */
export const VIDEO_LABEL = {
  short: { title: "Short-form", sub: "30–90 sec · 9:16 reels, agent or property" },
  // Dubai's long-form is "Walkthrough" (AUDIT item 24): post-production sells its own long-form.
  long: { title: "Walkthrough", sub: "Long-form, up to 5 min · 16:9, property or agent" },
} as const;

/* AI avatar videos (owner, 10 Oct 2026). Lengths follow the price list (17 Oct 2026): short
   form is up to 30 seconds (priced per 30 seconds), long form is priced per minute. */
export const AVATAR_FORMATS = {
  short: {
    label: "Short form (Instagram reels, 9:16)",
    stops: [30],
    unit: "s",
    def: 30,
  },
  long: { label: "Long form (YouTube, 16:9)", stops: [1, 2, 3, 5, 10, 15], unit: "min", def: 1 },
} as const;
