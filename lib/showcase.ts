import type { ShowcaseFeature, ShowcasePhoto } from "@/components/blocks/DashboardShowcase";
import type { OtherPricing, PortfolioItem, PropertyPricing } from "@/content/types";
import { lowestShootPrice } from "@/lib/pricing";

/** Real published portfolio photos for the showcase frames (placeholders when there are none). */
export function showcasePhotos(items: PortfolioItem[]): ShowcasePhoto[] {
  return items
    .filter((p) => p.published && !p.sample && p.format === "photo" && p.media.src)
    .slice(0, 9)
    .map((p) => ({ src: p.media.src!, alt: p.media.alt }));
}

/** The rate card numbers the frames show (the page's own prices, never made up). */
export type ShowcaseRates = {
  /** Property and content shoots (AED), on the apartment rate card's default size. */
  shoot?: {
    size: string;
    sizes: string[];
    photo: number;
    twilight: number;
    tour: number;
    reel: number;
    long: number;
    /** "from" on Property shoot (the lowest photo price) and Content shoot (a reel). */
    from: number;
    contentFrom: number;
    delivery: PropertyPricing["delivery"];
  };
  /** Edit only, from the post-production rate card (its own currency). */
  edit?: { currency: string; reel: number; long: number; photo: number };
};

/**
 * Booked videos are priced from the portal's rate card, not by property size (owner, 20 Oct
 * 2026): `reel_shoot` AED 400 and `long_form_shoot` AED 1,000 (the booking redesign migration),
 * as the Book media page and the FAQs show them. The website's database doesn't hold that table
 * yet, so the base amounts live here; change both together.
 */
export const VIDEO_RATES = { reel: 400, long: 1000 } as const;

export function showcaseRates(property?: PropertyPricing, other?: OtherPricing): ShowcaseRates {
  const post = other?.postProduction;
  const rate = (k: "photo" | "short" | "long") => post?.rates.find((r) => r.key === k)?.amount;
  const [reel, long, photo] = [rate("short"), rate("long"), rate("photo")];
  const edit =
    post && reel != null && long != null && photo != null
      ? { currency: post.currency, reel, long, photo }
      : undefined;
  if (!property) return { edit };
  const apt = property.apartment;
  const z = apt.sizes[apt.defaultSize] ?? apt.sizes[0];
  return {
    shoot: {
      size: z.label,
      sizes: apt.sizes.map((s) => s.label),
      photo: z.photo,
      twilight: property.twilight.standard[5],
      tour: z.tour,
      reel: VIDEO_RATES.reel,
      long: VIDEO_RATES.long,
      from: lowestShootPrice(property),
      contentFrom: VIDEO_RATES.reel,
      delivery: property.delivery,
    },
    edit,
  };
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
