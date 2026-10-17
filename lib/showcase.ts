import type { ShowcaseFeature, ShowcasePhoto } from "@/components/blocks/DashboardShowcase";
import type { PortfolioItem } from "@/content/types";

/** Real published portfolio photos for the showcase frames (placeholders when there are none). */
export function showcasePhotos(items: PortfolioItem[]): ShowcasePhoto[] {
  return items
    .filter((p) => p.published && !p.sample && p.format === "photo" && p.media.src)
    .slice(0, 9)
    .map((p) => ({ src: p.media.src!, alt: p.media.alt }));
}

/**
 * The frames' photos from Placements → Dashboard preview frames (lib/placements); while that
 * section is manual with nothing pinned, the newest real photos as before.
 */
export function placedShowcase(
  placed: { legacy: boolean; items: PortfolioItem[] },
  all: PortfolioItem[],
): ShowcasePhoto[] {
  if (placed.legacy) return showcasePhotos(all);
  return placed.items
    .filter((p) => p.media.src)
    .slice(0, 9)
    .map((p) => ({ src: p.media.src!, alt: p.media.alt }));
}

/**
 * The dashboard showcase per page (static frames, 13 Oct 2026). Each step is one still frame of a
 * real portal view; copy mirrors the portal. Icons are the portal's own (components/portal/Icon).
 */
export const SHOWCASE: Record<"home" | "property" | "post" | "avatars", ShowcaseFeature[]> = {
  home: [
    {
      icon: "home",
      title: "Your work, at a glance",
      text: "Every shoot, edit and video, with its real stage.",
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
      icon: "shoots",
      title: "Pick your shoot",
      text: "Sign in, press Book media, then pick Photos (by property size), Videos (one price each) or both.",
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
      title: "Request sent",
      text: "No payment now. We confirm the slot by email, usually within the hour.",
      screen: "confirmed",
    },
    {
      icon: "download",
      title: "Delivered",
      text: "Photos and videos land in your dashboard, with Download all.",
      screen: "deliveries",
    },
    {
      icon: "listings",
      title: "Share with buyers",
      text: "Send buyers one link for a single property or several, instead of dumping files on WhatsApp.",
      screen: "share",
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
      text: "Every batch shows its stage, from upload to delivery.",
      screen: "edit-status",
    },
    {
      icon: "chat",
      title: "Download or revise",
      text: "Download all, or request a revision on any file.",
      screen: "edit-delivered",
    },
  ],
  avatars: [
    {
      icon: "plus",
      title: "Brief your video",
      text: "Pick the format and length, then add a short brief.",
      screen: "avatar-request",
    },
    {
      icon: "board",
      title: "Track production",
      text: "See every video's stage, from brief to delivery.",
      screen: "avatar-production",
    },
    {
      icon: "download",
      title: "Download or revise",
      text: "Ready to post, with two revision rounds included.",
      screen: "avatar-delivered",
    },
  ],
};
