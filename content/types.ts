/**
 * Content shapes. These mirror the Supabase tables planned in guide §18.4, so the seed files
 * in this folder can be inserted as-is in Phase 5A and the same types describe database rows.
 */

export type Tone = "dark" | "light";

/** Pages that own FAQs, reviews, proof-strip toggles and SEO rows. */
export type PageKey =
  | "home"
  | "production"
  | "property-shoots"
  | "post-production"
  | "ai-avatars"
  | "contact"
  | "work"
  | "about";

/** Shared by every editable list (guide §18.4). */
export interface Publishable {
  id: string;
  published: boolean;
  sortOrder: number;
  /** Visible "sample" label until the owner supplies the real thing. */
  sample?: boolean;
}

/* ---------- media ---------- */

export interface Media {
  /** Image URL (public/ path now, Supabase Storage later). Omit to use a placeholder swatch. */
  src?: string;
  alt: string;
  /** Placeholder swatch key while real media is missing (see components/media/placeholders). */
  placeholder?: PlaceholderKey;
  /** Video: Bunny Stream id or YouTube/Vimeo URL. Always paired with a poster (src). */
  video?: string;
  /** Bright image (e.g. an avatar on white): frames drop the dark gradient and use dark overlays. */
  bright?: boolean;
  /**
   * Focal point for cropping, as CSS object-position (e.g. "55% 15%" keeps a face near the top in
   * frame at any ratio). The admin sets it on upload so crops never cut faces.
   */
  focus?: string;
}

export type PlaceholderKey =
  | "dusk"
  | "interior"
  | "villa"
  | "villa-dusk"
  | "villa-grey"
  | "night"
  | "kitchen"
  | "bath"
  | "aerial"
  | "clinic"
  | "salon"
  | "adam"
  | "avatar-clinic"
  | "avatar-finance"
  | "avatar-coach";

/* ---------- portfolio ---------- */

export type PortfolioCategory = "property" | "brand" | "ai-avatar" | "editing";
export type PortfolioFormat = "photo" | "reel" | "long-form" | "360";
export type PortfolioPlacement =
  | "home-reels"
  | "home-row-production"
  | "home-row-post"
  | "home-row-avatars"
  | "production-hero"
  | "property-hero"
  | "property-gallery-photo"
  | "property-gallery-video"
  | "property-gallery-360"
  | "post-hero"
  | "post-service-cards"
  | "work";

export interface PortfolioItem extends Publishable {
  title: string;
  client?: string;
  category: PortfolioCategory;
  format: PortfolioFormat;
  media: Media;
  /** e.g. "0:30" */
  duration?: string;
  /** Mono tag shown in the frame, e.g. "Marina 2BR" */
  tag?: string;
  /** Caption meta, e.g. "Property" */
  meta?: string;
  placements: PortfolioPlacement[];
  /** Position within a placement (mirrors portfolio_placements.sort_order); falls back to sortOrder. */
  placementOrder?: Partial<Record<PortfolioPlacement, number>>;
  featured?: boolean;
}

/* ---------- before / after ---------- */

export interface BeforeAfterPair extends Publishable {
  tab: string; // Sky · Twilight · HDR …
  title: string;
  description: string;
  before: Media;
  after: Media;
  /** CSS filter applied to the "before" layer, only used by placeholders. */
  placeholderBeforeFilter?: string;
  inHero?: boolean;
}

/* ---------- AI avatars ---------- */

/** AI avatars hero (admin: AI avatars → hero Adam video, caption line and reveal text). */
export interface AvatarHero {
  name: string;
  poster: Media;
  /** Optional clip; click-to-play once supplied. */
  clip?: string;
  timecode: string;
  captionLead: string;
  captionHighlight: string;
  revealTitle: string;
  revealText: string;
  proofLead: string;
  proofHighlight: string;
  sample?: boolean;
}

export interface AvatarExample extends Publishable {
  name: string;
  niche: string;
  poster: Media;
  clip?: string;
}

/* ---------- reviews, stats, clients, faqs ---------- */

export interface Review extends Publishable {
  name?: string;
  role: string;
  company?: string;
  rating: number;
  text: string;
  source: "google" | "other";
  link?: string;
  placements: PageKey[];
}

export type StatPlacement = "home" | "post-production";

export interface Stat extends Publishable {
  value: string;
  label: string;
  /** Per-placement label override (e.g. "Properties produced" on post-production). */
  labelByPlacement?: Partial<Record<StatPlacement, string>>;
  placements: StatPlacement[];
}

export interface Client extends Publishable {
  name: string;
  logo?: string;
}

export interface Faq extends Publishable {
  page: PageKey;
  question: string;
  /** Plain text for now; rich text (bold, links, lists) arrives with the admin editor. */
  answer: string;
  /** Draft FAQs show a "draft" label and are left out of FAQPage JSON-LD. */
  draft: boolean;
}

/* ---------- case studies ---------- */

export interface CaseStudy extends Publishable {
  slug: string;
  client: string;
  title: string;
  /**
   * The page's two-line hero title. Keep each line short (about 18 characters) so it fits a
   * 360px phone at the 34px minimum size; the admin will enforce this.
   */
  heroLines?: [string, string];
  /** One line for cards. */
  summary: string;
  brief: string;
  whatWeDid: string[];
  /** Label + value pairs, e.g. { value: "40", label: "reels a month" }. */
  results: { value: string; label: string }[];
  quote?: { text: string; name: string; role: string };
  cover: Media;
  gallery: Media[];
  /** Portfolio item ids shown as related work. */
  related: string[];
  category: PortfolioCategory;
}

/* ---------- pricing ---------- */

export type ResidentialType = "apartment" | "villa";
export type PropertyType = ResidentialType | "commercial";

/** Long-form lighting variants for apartments and villas. */
export type Lighting = "day" | "night" | "dayNight";

export interface ResidentialSize {
  label: string; // "Studio", "1 Bed" …
  photo: number;
  short: number;
  long: Record<Lighting, number>;
  tour: number;
}

export interface CommercialTier {
  label: string; // Basic, Essential …
  description: string;
  popular?: boolean;
  photo: number;
  short: number;
  /** null = not available in this tier (disables the service in the builder). */
  long: number | null;
  tour: number | null;
  includes: {
    photos: string;
    reel: string;
    walkthrough: string | null;
    tourHotspots: string | null;
  };
}

export type TwilightQty = 5 | 10 | 20;

export interface PropertyPricing {
  currency: "AED";
  apartment: { label: string; defaultSize: number; sizes: ResidentialSize[] };
  villa: { label: string; defaultSize: number; sizes: ResidentialSize[] };
  commercial: { label: string; defaultTier: number; tiers: CommercialTier[] };
  twilight: {
    /** Apartments and commercial. */
    standard: Record<TwilightQty, number>;
    villa: Record<TwilightQty, number>;
  };
  delivery: { photo: string; short: string; long: string; tour: string };
}

export interface RateCard {
  key: "photo" | "short" | "long";
  name: string;
  amount: number;
  unit: string;
  bullets: string[];
}

export interface OtherPricing {
  production: { fromMonthly: number; chips: string[] };
  postProduction: { currency: "USD"; rates: RateCard[]; note: string };
  aiAvatars: {
    launchLine: string;
    extraAvatarNote: string;
    tiers: { name: string; cadence: string; bullets: string[] }[];
  };
}

/* ---------- site settings ---------- */

export interface SiteSettings {
  company: string;
  licence: string;
  addressLine: string;
  whatsapp: { number: string; display: string };
  email: string;
  instagram: { handle: string; url: string };
  linkedin: { handle: string; url: string };
  googleRating: { value: number; count: number | null; url?: string };
  founder: { name: string; role: string; quote: string; photo: Media };
  showreel: Media & { duration: string };
  booking: {
    /** Time slots offered under the calendar. The last one must be the evening slot. */
    slots: string[];
    /** Days we don't shoot, 0 = Sunday … 6 = Saturday. */
    closedWeekdays: number[];
    /** How far ahead the calendar lets people book, in days from today. */
    windowDays: number;
    multiPropertyNote: string;
  };
  proofStripPages: PageKey[];
  footerLine: string;
}
