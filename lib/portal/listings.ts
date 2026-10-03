/** Listing share pages in the portal (CLIENT_PORTAL_GUIDE §6). Shared by forms and pages. */
export const PURPOSES = [
  ["sale", "Sale"],
  ["rent", "Rent yearly"],
  ["holiday", "Holiday home"],
] as const;
export type PurposeKey = (typeof PURPOSES)[number][0];
export const PRICE_LABEL: Record<PurposeKey, string> = {
  sale: "Price * (AED)",
  rent: "Price * (AED / year)",
  holiday: "Price * (AED / night)",
};
export const FURNISHINGS = [
  ["", "Not stated"],
  ["furnished", "Furnished"],
  ["unfurnished", "Unfurnished"],
  ["partly", "Partly furnished"],
] as const;

/** What the form sends and save_listing() stores (also saved to the property for next time). */
export type ListingInput = {
  title: string;
  purpose: PurposeKey;
  price: string;
  location: string;
  property_type: string;
  beds: string;
  baths: string;
  size_sqft: string;
  furnishing: string;
  description: string;
  highlights: string[];
  permit_no: string;
  permit_qr_key: string;
  contact_ids: string[];
  photo_ids: string[];
  reel_id: string;
  video_url: string;
  tour_url: string;
  show_brand: boolean;
  expires_on: string;
};

export type ListingRow = {
  id: string;
  slug: string;
  title: string;
  purpose: PurposeKey;
  price: number;
  status: "live" | "paused";
  expires_on: string | null;
  disabled_at: string | null;
  disabled_reason: string | null;
  created_by: string | null;
  project_id: string;
  photo_ids: string[];
  created_at: string;
};
export type CollectionRow = {
  id: string;
  slug: string;
  title: string;
  note: string | null;
  listing_ids: string[];
  contact_ids: string[];
  status: "live" | "paused";
  expires_on: string | null;
  disabled_at: string | null;
  disabled_reason: string | null;
  created_by: string | null;
  created_at: string;
};

/** Live, Paused, Expired, or turned off by Milkywayy. */
export function shareState(
  r: { status: string; expires_on: string | null; disabled_at: string | null },
  today: string,
) {
  if (r.disabled_at) return "disabled" as const;
  if (r.status === "paused") return "paused" as const;
  if (r.expires_on && r.expires_on < today) return "expired" as const;
  return "live" as const;
}
export const STATE_LABEL = {
  live: "Live",
  paused: "Paused",
  expired: "Expired",
  disabled: "Turned off by Milkywayy",
} as const;

/** "3 Bed" from a booking's size label ("3 Bed", "Studio", "4 Bed + Maid"…). */
export function bedsFromSize(size?: string) {
  if (!size) return "";
  if (/studio/i.test(size)) return "Studio";
  return /(\d+)\s*(?:br|bed)/i.exec(size)?.[1] ?? "";
}
