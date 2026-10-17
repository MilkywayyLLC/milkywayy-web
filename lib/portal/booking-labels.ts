/** Booking labels shared by the portal and the website's dashboard previews (no logic). */
export const SERVICE_LABEL: Record<"reels" | "long_form" | "property", string> = {
  reels: "Agent / social reels",
  long_form: "Long-form walkthrough",
  property: "Property shoot",
};
export const SERVICE_HINT: Record<"reels" | "long_form" | "property", string> = {
  property: "Photos, videography and 360 tour for a listing, priced like the website",
  reels: "Vertical 9:16 walkthroughs and agent-presented videos",
  long_form: "Horizontal 16:9 walkthrough for YouTube",
};

/* AI avatar videos (owner, 10 Oct 2026). */
export const AVATAR_FORMATS = {
  short: {
    label: "Short form (Instagram reels, 9:16)",
    stops: [30, 60, 90, 120],
    unit: "s",
    def: 30,
  },
  long: { label: "Long form (YouTube, 16:9)", stops: [2, 5, 10, 15], unit: "min", def: 2 },
} as const;
