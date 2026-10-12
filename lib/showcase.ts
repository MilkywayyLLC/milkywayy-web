import type { ShowcaseFeature } from "@/components/blocks/DashboardShowcase";

/**
 * The dashboard showcase per page (static frames, 13 Oct 2026). Each step is one still frame of a
 * real portal view; copy mirrors the portal. Icons are the portal's own (components/portal/Icon).
 */
export const SHOWCASE: Record<"home" | "property" | "post" | "avatars", ShowcaseFeature[]> = {
  home: [
    {
      icon: "home",
      title: "Your work, at a glance",
      text: "Every shoot, edit and video with its real stage, from request to delivery.",
      screen: "overview",
    },
    {
      icon: "plus",
      title: "Book media",
      text: "A shoot, an edit or an AI avatar video, booked from one button.",
      screen: "book-media",
    },
    {
      icon: "download",
      title: "Your deliveries",
      text: "Photos, reels and the 360 tour, with Download all.",
      screen: "deliveries",
    },
    {
      icon: "listings",
      title: "A page to share",
      text: "Turn a shoot into a listing page and send one link to buyers.",
      screen: "share",
    },
  ],
  property: [
    {
      icon: "plus",
      title: "Book a shoot",
      text: "Sign in with your email, press Book media, then Shoot.",
      screen: "book-shoot",
    },
    {
      icon: "shoots",
      title: "Pick the services",
      text: "Property type, size and services, priced as you choose.",
      screen: "book-property",
    },
    {
      icon: "pin",
      title: "When and where",
      text: "Pick a date and a slot, then drop the pin on the entrance.",
      screen: "book-where",
    },
    {
      icon: "bell",
      title: "Requested, then confirmed",
      text: "No payment now. We confirm the slot, usually within the hour.",
      screen: "confirmed",
    },
    {
      icon: "download",
      title: "Delivered",
      text: "Photos in 24 hours, videos in 48–72, with Download all.",
      screen: "deliveries",
    },
  ],
  post: [
    {
      icon: "editing",
      title: "Edit my files",
      text: "Pick the type and quantity, then paste links to your raw files.",
      screen: "edit-request",
    },
    {
      icon: "board",
      title: "Follow the edit",
      text: "Submitted, files received, in editing, delivered: every batch shows its stage.",
      screen: "edit-status",
    },
    {
      icon: "chat",
      title: "Download or revise",
      text: "Delivered files with Download all. Request a revision on any of them.",
      screen: "edit-delivered",
    },
  ],
  avatars: [
    {
      icon: "plus",
      title: "Brief your video",
      text: "Pick the format and length, choose who writes the script, add a brief.",
      screen: "avatar-request",
    },
    {
      icon: "board",
      title: "Track production",
      text: "Brief received, script ready, in production, delivered: always in view.",
      screen: "avatar-production",
    },
    {
      icon: "download",
      title: "Download or revise",
      text: "Captioned and branded, ready to post. Two revision rounds on every video.",
      screen: "avatar-delivered",
    },
  ],
};
