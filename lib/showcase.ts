import type { ShowcaseFeature } from "@/components/blocks/DashboardShowcase";

/**
 * The dashboard showcase per page (rebuilt site-refine, 12 Oct 2026). Each step is a real portal
 * view; copy mirrors the portal. Icons are the portal's own (components/portal/Icon).
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
      text: "Photos, reels, long-form and the 360 tour, with Download all.",
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
      title: "Book media",
      text: "Sign in with your email and press Book media, then Shoot.",
      screen: "book-media",
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
      icon: "check",
      title: "Requested",
      text: "Your request is in. No payment now.",
      screen: "requested",
    },
    {
      icon: "bell",
      title: "Confirmed",
      text: "We confirm the date and time, usually within the hour, and email you.",
      screen: "confirmed",
    },
    {
      icon: "download",
      title: "Delivered",
      text: "Photos in 24 hours, videos in 48–72, in delivery cards with Download all.",
      screen: "deliveries",
    },
  ],
  post: [
    {
      icon: "editing",
      title: "Edit my files",
      text: "Pick the type and quantity, then paste links or upload your raw files.",
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
      title: "Download or ask for changes",
      text: "Delivered files with Download all. Request a revision on any of them.",
      screen: "edit-delivered",
    },
  ],
  avatars: [
    {
      icon: "editing",
      title: "Approve the script",
      text: "We post the script; you approve it or ask for changes. Nothing is produced until you say go.",
      screen: "script",
    },
    {
      icon: "board",
      title: "Track production",
      text: "Brief received, script ready, in production, delivered: every video shows where it is.",
      screen: "track-avatar",
    },
    {
      icon: "download",
      title: "Download your videos",
      text: "Every video ready to post, captioned and branded, with Download all.",
      screen: "files-video",
    },
    {
      icon: "chat",
      title: "Request a revision",
      text: "Point to the timecode and say what to change. Two rounds on every video.",
      screen: "revision",
    },
  ],
};
