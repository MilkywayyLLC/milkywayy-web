import { createClient } from "@supabase/supabase-js";
import { portalKey, portalUrl } from "@/lib/portal/supabase";

/**
 * Public listing share pages (CLIENT_PORTAL_GUIDE §6): /l/<slug> and /c/<slug>. The pages read
 * through share_page(), which needs PORTAL_ADMIN_SECRET, so only this server can call it, and it
 * only answers for live pages. Media keys come back from the database; the page signs them.
 */
export type ShareContact = {
  name: string;
  role: string | null;
  whatsapp: string | null;
  email: string | null;
  brn: string | null;
  photo: string | null;
};
export type ShareBrand = { name: string | null; logo: string | null } | null;
export type SharePhoto = {
  id: string;
  key: string;
  thumb: string | null;
  web: string | null;
  og: string | null;
};
export type Purpose = "sale" | "rent" | "holiday";
export type ShareListing = {
  id: string;
  slug: string;
  title: string;
  purpose: Purpose;
  price: number;
  currency: string;
  location: string | null;
  property_type: string | null;
  beds: string | null;
  baths: number | null;
  size_sqft: number | null;
  furnishing: "furnished" | "unfurnished" | "partly" | null;
  description: string | null;
  highlights: string[];
  permit_no: string | null;
  permit_qr: string | null;
  video_url: string | null;
  tour_url: string | null;
};
export type ListingPage =
  | {
      state: "live";
      listing: ShareListing;
      photos: SharePhoto[];
      reel: { web: string; poster: string | null } | null;
      contacts: ShareContact[];
      brand: ShareBrand;
    }
  | { state: "unavailable" | "missing" };
export type CollectionItem = Pick<
  ShareListing,
  "slug" | "title" | "purpose" | "price" | "currency" | "location" | "beds" | "baths" | "size_sqft"
> & { photo: SharePhoto | null };
export type CollectionPage =
  | {
      state: "live";
      collection: { id: string; slug: string; title: string; note: string | null };
      listings: CollectionItem[];
      contacts: ShareContact[];
      brand: ShareBrand;
    }
  | { state: "unavailable" | "missing" };

export const shareReady = () => !!(portalUrl && portalKey && process.env.PORTAL_ADMIN_SECRET);

const db = () =>
  createClient(portalUrl, portalKey, { auth: { persistSession: false, autoRefreshToken: false } });

export const SLUG = /^[A-Za-z0-9_-]{1,120}$/;

export async function sharePage(kind: "l", slug: string): Promise<ListingPage>;
export async function sharePage(kind: "c", slug: string): Promise<CollectionPage>;
export async function sharePage(kind: "l" | "c", slug: string) {
  if (!SLUG.test(slug) || !shareReady()) return { state: "missing" };
  const { data, error } = await db().rpc("share_page", {
    p_secret: process.env.PORTAL_ADMIN_SECRET,
    p_kind: kind,
    p_slug: slug,
  });
  if (error) throw new Error(error.message);
  return data;
}

export async function shareTrack(kind: "l" | "c", slug: string, event: "view" | "wa" | "call") {
  if (!SLUG.test(slug) || !shareReady()) return false;
  const { data } = await db().rpc("share_track", {
    p_secret: process.env.PORTAL_ADMIN_SECRET,
    p_kind: kind,
    p_slug: slug,
    p_event: event,
  });
  return data === true;
}

export async function shareReport(kind: "l" | "c", slug: string, reason: string) {
  if (!SLUG.test(slug) || !shareReady()) return false;
  const { data } = await db().rpc("share_report", {
    p_secret: process.env.PORTAL_ADMIN_SECRET,
    p_kind: kind,
    p_slug: slug,
    p_reason: reason.slice(0, 500),
  });
  return data === true;
}

/**
 * Crawlers, link-preview fetchers, headless browsers and scripts: never counted. People who
 * share the link on WhatsApp make WhatsApp fetch it once for the preview; that isn't a view.
 */
const BOT =
  /bot\b|bot\/|crawl|spider|slurp|facebookexternalhit|facebookcatalog|meta-external|whatsapp|telegram|slack|discord|twitter|linkedin|skype|pinterest|embedly|preview|headless|lighthouse|pagespeed|gtmetrix|pingdom|uptime|curl|wget|python|axios|node-fetch|undici|go-http|java\/|okhttp|httpclient|libwww|vercel|google-|bingpreview|yandex|baidu|duckduck|applebot|petalbot|semrush|ahrefs/i;
export const isBot = (ua: string | null) => !ua || ua.length < 20 || BOT.test(ua);

// ---------- formatting ----------

export const PURPOSE_LABEL: Record<Purpose, string> = {
  sale: "For sale",
  rent: "For rent",
  holiday: "Holiday home",
};
export const PRICE_UNIT: Record<Purpose, string> = {
  sale: "",
  rent: " / year",
  holiday: " / night",
};
export const price = (amount: number, currency: string, purpose: Purpose) =>
  `${currency} ${Number(amount).toLocaleString("en-US", { maximumFractionDigits: 0 })}${PRICE_UNIT[purpose]}`;
export const FURNISHING: Record<string, string> = {
  furnished: "Furnished",
  unfurnished: "Unfurnished",
  partly: "Partly furnished",
};
const bedLabel = (b: string) => (/^\d+$/.test(b) ? `${b} Bed` : b);
const num = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

/** "3 Bed · 4 Bath · 2,410 sq ft · Furnished", as boxes on the page and one line in previews. */
export function facts(l: Partial<ShareListing>) {
  return [
    l.beds ? bedLabel(l.beds) : null,
    l.baths != null ? `${num(Number(l.baths))} Bath` : null,
    l.size_sqft ? `${Number(l.size_sqft).toLocaleString("en-US")} sq ft` : null,
    l.furnishing ? FURNISHING[l.furnishing] : null,
  ].filter(Boolean) as string[];
}

const digits = (phone: string) => phone.replace(/\D/g, "");
/** The pre-filled WhatsApp message from the guide: "Hi, I'm interested in {title} ({url})". */
export const whatsappLink = (phone: string, title: string, url: string) =>
  `https://wa.me/${digits(phone)}?text=${encodeURIComponent(`Hi, I’m interested in ${title} (${url})`)}`;
export const telLink = (phone: string) => `tel:+${digits(phone)}`;

/** YouTube or Vimeo, as a privacy-friendly embed URL (loaded only when someone taps play). */
export function embedUrl(url: string | null) {
  if (!url) return null;
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^(www|m)\./, "");
    if (host === "youtu.be")
      return `https://www.youtube-nocookie.com/embed/${u.pathname.slice(1)}?autoplay=1`;
    if (host === "youtube.com") {
      const id =
        u.searchParams.get("v") ?? /^\/(?:embed|shorts|live)\/([^/?]+)/.exec(u.pathname)?.[1];
      return id ? `https://www.youtube-nocookie.com/embed/${id}?autoplay=1` : null;
    }
    if (host === "vimeo.com" || host === "player.vimeo.com") {
      const m = /\/(?:video\/)?(\d+)(?:\/([0-9a-f]+))?/.exec(u.pathname);
      if (!m) return null;
      const h = m[2] ?? u.searchParams.get("h");
      return `https://player.vimeo.com/video/${m[1]}?autoplay=1${h ? `&h=${h}` : ""}`;
    }
  } catch {}
  return null;
}
